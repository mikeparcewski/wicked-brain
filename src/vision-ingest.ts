import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as fs from "node:fs";
import { getModel } from "@mariozechner/pi-ai";
import { Agent } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { BrainHandle } from "./brain.js";
import { createBrainTools } from "./agent/tools.js";
import { safeSourceName } from "./ingest.js";
import { BrainPath } from "./brain-path.js";

export const VISION_EXTENSIONS = new Set([
  "pdf", "docx", "pptx", "xlsx", "png", "jpg", "jpeg", "gif", "webp", "svg",
]);

export interface VisionIngestResult {
  source_name: string;
  chunks_created: number;
}

/** Maps file extension to MIME type */
export function getMimeType(ext: string): string {
  const lower = ext.toLowerCase();
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return mimeMap[lower] ?? "application/octet-stream";
}

/** Load the vision-ingest system prompt from _ops/ or fall back to a default */
function loadVisionIngestPrompt(brain: BrainHandle): string {
  const opsPath = path.join(brain.root, "_ops", "vision-ingest.md");
  try {
    return fs.readFileSync(opsPath, "utf-8");
  } catch {
    return DEFAULT_VISION_INGEST_PROMPT;
  }
}

const DEFAULT_VISION_INGEST_PROMPT = `You are a vision-based document extraction agent for a digital brain.

Your task is to extract all content from binary documents (PDFs, Office files, images) into structured markdown chunks.

## Rules
- Extract ALL content — don't skip sections
- Create one chunk per logical section, page, or slide
- For images and charts: describe them thoroughly in text
- For tables: render as markdown tables
- For slides: one chunk per slide or logical group
- Number chunks sequentially: chunk-001, chunk-002, etc.
- Each chunk must have complete YAML frontmatter
- Write chunks via brain_write
- After writing all chunks, confirm how many you created
`;

export async function visionIngest(
  brain: BrainHandle,
  rawRelativePath: string,
  ext: string,
): Promise<VisionIngestResult> {
  const sourceName = safeSourceName(rawRelativePath);
  const absPath = path.join(brain.root, rawRelativePath);

  // Read the binary file as base64
  const fileBuffer = await fsp.readFile(absPath);
  const base64Data = fileBuffer.toString("base64");
  const mimeType = getMimeType(ext);

  // Build the agent prompt
  const agentPrompt = buildAgentPrompt(rawRelativePath, sourceName, ext);

  // Set up tools: brain_write and brain_status
  const allTools = createBrainTools(brain);
  const toolNames = new Set(["brain_write", "brain_status"]);
  const filteredTools = allTools.filter((t) => toolNames.has(t.name));

  // Load system prompt
  const systemPrompt = loadVisionIngestPrompt(brain);

  // Get model from brain config (key: "ingest"), fallback to claude-sonnet-4-20250514
  const brainConfig = brain.config();
  const modelConfig = brainConfig.models?.["ingest"] ?? brainConfig.models?.["default"];

  let model;
  if (modelConfig) {
    model = getModel(
      modelConfig.provider as "anthropic",
      modelConfig.model as "claude-sonnet-4-20250514"
    );
  } else {
    model = getModel("anthropic" as "anthropic", "claude-sonnet-4-20250514" as "claude-sonnet-4-20250514");
  }

  // Create agent
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: model as ReturnType<typeof getModel>,
      thinkingLevel: "medium",
      tools: filteredTools,
      messages: [],
    },
    toolExecution: "sequential",
  });

  // Build image/document content for the prompt
  const imageContent: ImageContent = {
    type: "image",
    data: base64Data,
    mimeType,
  };

  // Run the agent with the document attached
  await agent.prompt(agentPrompt, [imageContent]);
  await agent.waitForIdle();

  // Count chunks written by the agent
  const chunksDir = `chunks/extracted/${sourceName}`;
  let chunksCreated = 0;
  try {
    const chunkFiles = await brain.storage.list(BrainPath.from(chunksDir), {
      recursive: false,
      pattern: "*.md",
    });
    chunksCreated = chunkFiles.length;
  } catch {
    chunksCreated = 0;
  }

  // Index written chunks into search
  try {
    const chunkFiles = await brain.storage.list(BrainPath.from(chunksDir), {
      recursive: false,
      pattern: "*.md",
    });
    for (const chunkPath of chunkFiles) {
      const chunkRelPath = chunkPath.toString();
      const chunkAbsPath = path.join(brain.root, chunkRelPath);
      let chunkContent: string;
      try {
        chunkContent = await fsp.readFile(chunkAbsPath, "utf-8");
      } catch {
        continue;
      }
      const chunkId = chunkRelPath.replace("chunks/extracted/", "").replace(".md", "");
      await brain.search.index({
        id: chunkId,
        path: chunkRelPath,
        content: chunkContent,
        frontmatter: { source: rawRelativePath, source_type: ext },
        brain_id: brain.config().id,
      });
    }
  } catch {
    // Search indexing is best-effort
  }

  // Log event
  const now = new Date().toISOString();
  await brain.eventLog.append({
    ts: now,
    op: "write",
    path: `_meta/manifest:${rawRelativePath}`,
    author: "vision-ingest",
    content_hash: `vision-${Date.now()}`,
    source_chunks: [],
  });

  return {
    source_name: sourceName,
    chunks_created: chunksCreated,
  };
}

function buildAgentPrompt(rawRelativePath: string, sourceName: string, ext: string): string {
  return `Extract the content from this document into structured chunks for a knowledge base.

Source file: ${rawRelativePath}
Source name: ${sourceName}

For each logical section or page of the document:

1. Create a chunk file at chunks/extracted/${sourceName}/chunk-NNN.md
2. Each chunk must have YAML frontmatter with these fields:
   - source: "${rawRelativePath}"
   - source_type: "${ext}"
   - chunk_id: "${sourceName}/chunk-NNN"
   - content_type: ["text"] or ["visual"] or ["table"] or ["mixed"]
   - contains: [relevant topic tags]
   - entities:
       systems: [named systems/platforms]
       people: [people/roles mentioned]
       programs: [programs/initiatives]
       metrics: [quantitative figures with context, e.g. "Revenue: $4.2B"]
   - confidence: 0.85 (adjust based on clarity)
   - indexed_at: current ISO timestamp
   - narrative_theme: short phrase describing the main point (8 words max)
   - figures: [descriptions of any charts, tables, diagrams]
3. The body after frontmatter should be the extracted text content in markdown format
4. For images/charts: describe them thoroughly in text
5. For tables: render as markdown tables
6. For slides: one chunk per slide or logical group

Use brain_write to save each chunk. Write them in order (chunk-001, chunk-002, etc.).

After writing all chunks, respond with a summary of how many chunks you created and what they cover.`;
}
