import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { BrainHandle } from "./brain.js";
import type { ChunkFrontmatter } from "./types.js";
import { contentHash } from "./hasher.js";
import { serializeFrontmatter } from "./frontmatter.js";
import { BrainPath } from "./brain-path.js";
import { visionIngest, VISION_EXTENSIONS } from "./vision-ingest.js";

export interface IngestResult {
  source_name: string;
  chunks_created: number;
  skipped?: boolean;
  archived?: boolean;
}

/** Converts a filename to a safe directory name */
export function safeSourceName(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Detect source type from extension */
function detectSourceType(
  filename: string
): ChunkFrontmatter["source_type"] {
  const ext = path.extname(filename).toLowerCase().slice(1);
  const validTypes: ChunkFrontmatter["source_type"][] = [
    "pdf", "pptx", "docx", "html", "image", "md", "txt", "csv",
  ];
  if (validTypes.includes(ext as ChunkFrontmatter["source_type"])) {
    return ext as ChunkFrontmatter["source_type"];
  }
  return "txt";
}

/** Count words in a string */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/** Extract simple keywords from text (lowercase words, deduplicated, top 10) */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "is", "was", "are", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "this", "that", "these",
    "those", "it", "its", "from", "by", "as", "not", "so", "if", "then",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

export const TEXT_EXTENSIONS = new Set(["md", "markdown", "txt", "csv", "html", "htm", "json"]);

/** Returns true if the file requires vision-based LLM extraction */
export function needsVisionIngest(ext: string): boolean {
  return VISION_EXTENSIONS.has(ext.toLowerCase());
}

const MAX_WORDS = 800;

/** Split markdown text on H1/H2 headings */
function splitMarkdown(content: string): string[] {
  const lines = content.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{1,2}\s/.test(line) && current.length > 0) {
      sections.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const last = current.join("\n").trim();
    if (last) sections.push(last);
  }

  // Sub-split sections over MAX_WORDS
  const result: string[] = [];
  for (const section of sections) {
    if (wordCount(section) > MAX_WORDS) {
      result.push(...splitByWords(section, MAX_WORDS));
    } else if (section) {
      result.push(section);
    }
  }
  return result.filter((s) => s.trim().length > 0);
}

/** Split text into chunks by paragraph groups ~MAX_WORDS words */
function splitByParagraphs(content: string): string[] {
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current: string[] = [];
  let count = 0;

  for (const para of paragraphs) {
    const wc = wordCount(para);
    if (count + wc > MAX_WORDS && current.length > 0) {
      chunks.push(current.join("\n\n").trim());
      current = [para];
      count = wc;
    } else {
      current.push(para);
      count += wc;
    }
  }
  if (current.length > 0) {
    const last = current.join("\n\n").trim();
    if (last) chunks.push(last);
  }
  return chunks.filter((c) => c.trim().length > 0);
}

/** Split a single text block by word limit */
function splitByWords(text: string, limit: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += limit) {
    chunks.push(words.slice(i, i + limit).join(" "));
  }
  return chunks;
}

/** Split content into chunks based on file type */
function splitContent(content: string, sourceType: ChunkFrontmatter["source_type"]): string[] {
  if (sourceType === "md") {
    return splitMarkdown(content);
  }
  return splitByParagraphs(content);
}

export async function ingestFile(
  brain: BrainHandle,
  rawRelativePath: string
): Promise<IngestResult> {
  const filename = path.basename(rawRelativePath);
  const ext = path.extname(filename).slice(1).toLowerCase();

  // Route binary formats to vision-based LLM extraction
  if (needsVisionIngest(ext)) {
    const result = await visionIngest(brain, rawRelativePath, ext);
    return { source_name: result.source_name, chunks_created: result.chunks_created };
  }

  const safeName = safeSourceName(rawRelativePath);
  const sourceType = detectSourceType(filename);
  const manifestKey = `_meta/manifest:${rawRelativePath}`;

  // Read the actual file content
  const absPath = path.join(brain.root, rawRelativePath);
  let fileContent: string;
  try {
    fileContent = await fsp.readFile(absPath, "utf-8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      throw new Error(`File not found: ${absPath}`);
    }
    throw err;
  }

  const hash = contentHash(fileContent);

  // Check event log for previous manifest entry with same hash
  const allEvents = await brain.eventLog.readAll();
  const previousManifest = allEvents
    .filter(
      (e) =>
        e.op === "write" &&
        e.path === manifestKey &&
        (e as { content_hash: string }).content_hash === hash
    )
    .pop();

  if (previousManifest) {
    return { source_name: safeName, chunks_created: 0, skipped: true };
  }

  // Check if previously ingested (any manifest entry for this source, regardless of hash)
  const previousIngest = allEvents
    .filter((e) => e.op === "write" && e.path === manifestKey)
    .pop();

  let archived = false;
  if (previousIngest) {
    // Archive old chunks
    const timestamp = Date.now();
    const extractedDir = path.join(brain.root, "chunks", "extracted", safeName);
    const archivedDir = path.join(
      brain.root,
      "chunks",
      "extracted",
      `${safeName}.archived-${timestamp}`
    );

    try {
      await fsp.rename(extractedDir, archivedDir);
      // Log delete events for old chunks
      const now = new Date().toISOString();
      await brain.eventLog.append({
        ts: now,
        op: "delete",
        path: `chunks/extracted/${safeName}/`,
        author: "ingest",
        reason: `archived before re-ingest of ${rawRelativePath}`,
      });
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== "ENOENT") {
        throw err;
      }
    }
    archived = true;
  }

  // Split content into chunks
  const chunks = splitContent(fileContent, sourceType);
  const actualChunks = chunks.length > 0 ? chunks : [fileContent];

  const chunkPaths: string[] = [];
  const indexedAt = new Date().toISOString();

  for (let i = 0; i < actualChunks.length; i++) {
    const chunkText = actualChunks[i];
    const chunkNum = String(i).padStart(3, "0");
    const chunkId = `${safeName}/chunk-${chunkNum}`;
    const chunkRelPath = `chunks/extracted/${safeName}/chunk-${chunkNum}.md`;

    const frontmatter: ChunkFrontmatter = {
      source: rawRelativePath,
      source_type: sourceType,
      chunk_id: chunkId,
      content_type: ["text"],
      contains: extractKeywords(chunkText),
      entities: { systems: [], people: [], programs: [], metrics: [] },
      confidence: 0.7,
      indexed_at: indexedAt,
    };

    const chunkContent = serializeFrontmatter(
      frontmatter as unknown as Record<string, unknown>,
      chunkText
    );

    // Write chunk file
    const chunkBrainPath = BrainPath.from(chunkRelPath);
    await brain.storage.write(chunkBrainPath, chunkContent);

    // Index into search
    await brain.search.index({
      id: chunkId,
      path: chunkRelPath,
      content: chunkText,
      frontmatter: frontmatter as unknown as Record<string, unknown>,
      brain_id: brain.config().id,
    });

    chunkPaths.push(chunkRelPath);

    // Log write event
    await brain.eventLog.append({
      ts: indexedAt,
      op: "write",
      path: chunkRelPath,
      author: "ingest",
      content_hash: contentHash(chunkContent),
      word_count: wordCount(chunkText),
    });
  }

  // Log manifest entry
  const manifestContent = JSON.stringify({
    source: rawRelativePath,
    hash,
    chunks: chunkPaths,
    ingested_at: indexedAt,
  });

  await brain.eventLog.append({
    ts: indexedAt,
    op: "write",
    path: manifestKey,
    author: "ingest",
    content_hash: hash,
    source_chunks: chunkPaths,
  });

  return {
    source_name: safeName,
    chunks_created: actualChunks.length,
    archived,
  };
}
