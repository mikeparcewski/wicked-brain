import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BrainHandle } from "../brain.js";
import { JobManager } from "../agent/job-manager.js";
import { createOperationAgent } from "../agent/operations.js";
import { createBrainTools } from "../agent/tools.js";
import { resolveBrainRefs } from "../federation.js";
import { BrainPath } from "../brain-path.js";
import { contentHash } from "../hasher.js";
import { ingestFile } from "../ingest.js";
import { ProgressiveLoader } from "../progressive.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = Record<string, any>;

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function err(message: string): McpToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Low-level brain tools (11)
// ──────────────────────────────────────────────────────────────────────────────

export async function handleBrainSearch(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const brainRefs = await resolveBrainRefs(brain);
    const result = await brain.search.searchFederated(
      {
        query: params["query"] as string,
        limit: params["limit"] as number | undefined,
        offset: params["offset"] as number | undefined,
      },
      brainRefs
    );
    return ok(result);
  } catch (e) {
    return err(`brain_search failed: ${(e as Error).message}`);
  }
}

export async function handleBrainRead(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const loader = new ProgressiveLoader(brain);
    const bp = BrainPath.from(params["path"] as string);
    const depth = (params["depth"] as number | undefined) ?? 1;
    const result = await loader.read(bp, depth, params["sections"] as string[] | undefined);
    return ok(result);
  } catch (e) {
    return err(`brain_read failed: ${(e as Error).message}`);
  }
}

export async function handleBrainWrite(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const bp = BrainPath.from(params["path"] as string);
    const receipt = await brain.storage.write(bp, params["content"] as string, {
      expectedHash: params["expected_hash"] as string | undefined,
    });
    const hash = contentHash(params["content"] as string);
    await brain.eventLog.append({
      ts: new Date().toISOString(),
      op: "write",
      path: params["path"] as string,
      author: "mcp",
      content_hash: hash,
    });
    return ok(receipt);
  } catch (e) {
    return err(`brain_write failed: ${(e as Error).message}`);
  }
}

export async function handleBrainList(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const dir = (params["path"] as string | undefined) ? BrainPath.from(params["path"] as string) : BrainPath.from(".");
    const paths = await brain.storage.list(dir, {
      pattern: params["pattern"] as string | undefined,
      recursive: params["recursive"] as boolean | undefined,
    });
    return ok(paths.map((p) => p.toString()));
  } catch (e) {
    return err(`brain_list failed: ${(e as Error).message}`);
  }
}

export async function handleBrainStatus(brain: BrainHandle, _params: AnyParams): Promise<McpToolResult> {
  try {
    const stats = await brain.search.stats();
    const config = brain.config();
    return ok({ stats, config });
  } catch (e) {
    return err(`brain_status failed: ${(e as Error).message}`);
  }
}

export async function handleBrainBacklinks(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const result = await brain.search.backlinks(params["path"] as string);
    return ok(result);
  } catch (e) {
    return err(`brain_backlinks failed: ${(e as Error).message}`);
  }
}

export async function handleBrainForwardLinks(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const result = await brain.search.forwardLinks(params["path"] as string);
    return ok(result);
  } catch (e) {
    return err(`brain_forward_links failed: ${(e as Error).message}`);
  }
}

export async function handleBrainLint(brain: BrainHandle, _params: AnyParams): Promise<McpToolResult> {
  try {
    const issues: Array<{ type: string; path?: string; message: string }> = [];
    const allDocs = await brain.storage.list(BrainPath.from("."), { recursive: true });
    const allPathSet = new Set(allDocs.map((p) => p.toString()));

    for (const p of allDocs) {
      const pathStr = p.toString();
      if (!pathStr.endsWith(".md")) continue;
      try {
        const fwLinks = await brain.search.forwardLinks(pathStr);
        for (const link of fwLinks) {
          if (!allPathSet.has(link) && !link.includes("::")) {
            issues.push({ type: "broken_link", path: pathStr, message: `Broken wikilink to: ${link}` });
          }
        }
      } catch {
        // ignore per-file errors
      }
    }
    return ok({ issues });
  } catch (e) {
    return err(`brain_lint failed: ${(e as Error).message}`);
  }
}

export async function handleBrainDiff(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    let entries;
    if (params["since"] as string | undefined) {
      entries = await brain.eventLog.readSince(params["since"] as string);
    } else {
      entries = await brain.eventLog.readAll();
    }
    return ok(entries);
  } catch (e) {
    return err(`brain_diff failed: ${(e as Error).message}`);
  }
}

export async function handleBrainResolve(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const bp = BrainPath.from(params["ref"] as string);
    const exists = await brain.storage.exists(bp);
    return ok({ ref: params["ref"], path: bp.toString(), exists });
  } catch (e) {
    return ok({ ref: params["ref"], error: (e as Error).message, exists: false });
  }
}

export async function handleBrainIngest(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const result = await ingestFile(brain, params["source"] as string);
    return ok(result);
  } catch (e) {
    return err(`brain_ingest failed: ${(e as Error).message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Agent operation tools (4 × brain_op_*)
// ──────────────────────────────────────────────────────────────────────────────

export async function handleBrainOpStart(
  brain: BrainHandle,
  jobManager: JobManager,
  operation: string,
  params: AnyParams
): Promise<McpToolResult> {
  try {
    const job = await jobManager.create(operation);
    const prompt = (params["prompt"] as string | undefined) ?? `Run ${operation} operation.`;

    // Spawn agent in background — do NOT await
    const agent = createOperationAgent(brain, operation);
    agent
      .prompt(prompt)
      .then(async (result) => {
        await jobManager.complete(job.job_id, result);
      })
      .catch(async (e: unknown) => {
        await jobManager.fail(job.job_id, (e as Error).message ?? String(e));
      });

    return ok({ job_id: job.job_id, operation, status: "running" });
  } catch (e) {
    return err(`brain_op_${operation} failed: ${(e as Error).message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Job management tools
// ──────────────────────────────────────────────────────────────────────────────

export async function handleBrainJobStatus(jobManager: JobManager, params: AnyParams): Promise<McpToolResult> {
  try {
    const job = await jobManager.getStatus(params["job_id"] as string);
    if (!job) {
      return err(`Job not found: ${params["job_id"] as string}`);
    }
    return ok(job);
  } catch (e) {
    return err(`brain_job_status failed: ${(e as Error).message}`);
  }
}

export async function handleBrainJobCancel(jobManager: JobManager, params: AnyParams): Promise<McpToolResult> {
  try {
    await jobManager.cancel(params["job_id"] as string);
    return ok({ cancelled: true, job_id: params["job_id"] });
  } catch (e) {
    return err(`brain_job_cancel failed: ${(e as Error).message}`);
  }
}

export async function handleBrainSchedule(
  brain: BrainHandle,
  jobManager: JobManager,
  params: AnyParams
): Promise<McpToolResult> {
  // brain_schedule is an alias for starting an op with an optional cron
  // For now, treat it as immediately starting an op (cron scheduling is out of scope for v1)
  const operation = params["operation"] as string;
  return handleBrainOpStart(brain, jobManager, operation, params);
}

export async function handleBrainExport(brain: BrainHandle, params: AnyParams): Promise<McpToolResult> {
  try {
    const format = (params["format"] as string | undefined) ?? "json";
    const allDocs = await brain.storage.list(BrainPath.from("."), { recursive: true, pattern: "**/*.md" });
    const config = brain.config();

    if (format === "manifest") {
      return ok({
        brain_id: config.id,
        brain_name: config.name,
        file_count: allDocs.length,
        files: allDocs.map((p) => p.toString()),
      });
    }

    // Default: json export with file list and config
    return ok({
      brain_id: config.id,
      brain_name: config.name,
      exported_at: new Date().toISOString(),
      file_count: allDocs.length,
      files: allDocs.map((p) => p.toString()),
    });
  } catch (e) {
    return err(`brain_export failed: ${(e as Error).message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Resources
// ──────────────────────────────────────────────────────────────────────────────

export async function readMetaFile(brain: BrainHandle, filename: string): Promise<string> {
  const filePath = path.join(brain.root, "_meta", filename);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return `# ${filename.replace(".md", "")}\n\n(No content yet)\n`;
  }
}

export async function handleResourceOrientation(brain: BrainHandle): Promise<string> {
  return readMetaFile(brain, "orientation.md");
}

export async function handleResourceRecent(brain: BrainHandle): Promise<string> {
  return readMetaFile(brain, "recent.md");
}

export async function handleResourceGaps(brain: BrainHandle): Promise<string> {
  return readMetaFile(brain, "gaps.md");
}

// ──────────────────────────────────────────────────────────────────────────────
// Dispatch table — maps tool name -> handler
// ──────────────────────────────────────────────────────────────────────────────

export function createToolDispatch(brain: BrainHandle, jobManager: JobManager) {
  return async (name: string, params: AnyParams): Promise<McpToolResult> => {
    switch (name) {
      case "brain_search":
        return handleBrainSearch(brain, params);
      case "brain_read":
        return handleBrainRead(brain, params);
      case "brain_write":
        return handleBrainWrite(brain, params);
      case "brain_list":
        return handleBrainList(brain, params);
      case "brain_status":
        return handleBrainStatus(brain, params);
      case "brain_backlinks":
        return handleBrainBacklinks(brain, params);
      case "brain_forward_links":
        return handleBrainForwardLinks(brain, params);
      case "brain_lint":
        return handleBrainLint(brain, params);
      case "brain_diff":
        return handleBrainDiff(brain, params);
      case "brain_resolve":
        return handleBrainResolve(brain, params);
      case "brain_ingest":
        return handleBrainIngest(brain, params);
      case "brain_op_structure":
        return handleBrainOpStart(brain, jobManager, "structure", params);
      case "brain_op_compile":
        return handleBrainOpStart(brain, jobManager, "compile", params);
      case "brain_op_lint":
        return handleBrainOpStart(brain, jobManager, "lint", params);
      case "brain_op_enhance":
        return handleBrainOpStart(brain, jobManager, "enhance", params);
      case "brain_job_status":
        return handleBrainJobStatus(jobManager, params);
      case "brain_job_cancel":
        return handleBrainJobCancel(jobManager, params);
      case "brain_schedule":
        return handleBrainSchedule(brain, jobManager, params);
      case "brain_export":
        return handleBrainExport(brain, params);
      default:
        return err(`Unknown tool: ${name}`);
    }
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tool definitions — JSON Schema inputSchema for each tool
// ──────────────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    // ── 11 low-level brain tools ──
    {
      name: "brain_search",
      description: "Full-text search across the brain and federated brains",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          depth: { type: "number", description: "Federation depth" },
          limit: { type: "number", description: "Maximum results" },
          offset: { type: "number", description: "Pagination offset" },
        },
        required: ["query"],
      },
    },
    {
      name: "brain_read",
      description: "Read a file from the brain with progressive detail levels",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path within the brain" },
          depth: { type: "number", description: "0=stats, 1=summary+sections, 2=full content" },
          sections: { type: "array", items: { type: "string" }, description: "Section filter for depth 2" },
        },
        required: ["path"],
      },
    },
    {
      name: "brain_write",
      description: "Write content to a file in the brain",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path within the brain" },
          content: { type: "string", description: "File content" },
          expected_hash: { type: "string", description: "Expected current content hash for optimistic concurrency" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "brain_list",
      description: "List files in a brain directory",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (defaults to root)" },
          pattern: { type: "string", description: "Glob pattern filter" },
          recursive: { type: "boolean", description: "List recursively" },
        },
      },
    },
    {
      name: "brain_status",
      description: "Get brain status including index statistics and configuration",
      inputSchema: {
        type: "object",
        properties: {
          depth: { type: "number", description: "Federation depth" },
        },
      },
    },
    {
      name: "brain_backlinks",
      description: "Find all documents that link to a given path",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Target path to find backlinks for" },
        },
        required: ["path"],
      },
    },
    {
      name: "brain_forward_links",
      description: "Find all links going out from a given document",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Source path to find forward links for" },
        },
        required: ["path"],
      },
    },
    {
      name: "brain_lint",
      description: "Check brain for structural issues and broken links",
      inputSchema: {
        type: "object",
        properties: {
          deep: { type: "boolean", description: "Perform deep lint checks" },
        },
      },
    },
    {
      name: "brain_diff",
      description: "Show brain changes since a given timestamp",
      inputSchema: {
        type: "object",
        properties: {
          since: { type: "string", description: "ISO timestamp — returns all events after this time" },
        },
      },
    },
    {
      name: "brain_resolve",
      description: "Resolve a path reference and check if it exists",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Path reference to resolve" },
        },
        required: ["ref"],
      },
    },
    {
      name: "brain_ingest",
      description: "Ingest a raw file into the brain (chunk and index it)",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Relative path to the source file within the brain" },
        },
        required: ["source"],
      },
    },
    // ── 4 agent operation tools ──
    {
      name: "brain_op_structure",
      description: "Run the structure agent operation (async — returns job_id)",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "User prompt for the operation" },
        },
      },
    },
    {
      name: "brain_op_compile",
      description: "Run the compile agent operation (async — returns job_id)",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "User prompt for the operation" },
        },
      },
    },
    {
      name: "brain_op_lint",
      description: "Run the lint agent operation (async — returns job_id)",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "User prompt for the operation" },
        },
      },
    },
    {
      name: "brain_op_enhance",
      description: "Run the enhance agent operation (async — returns job_id)",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "User prompt for the operation" },
        },
      },
    },
    // ── Job management ──
    {
      name: "brain_job_status",
      description: "Get the status of an async job",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Job ID returned by an async operation" },
        },
        required: ["job_id"],
      },
    },
    {
      name: "brain_job_cancel",
      description: "Cancel a running async job",
      inputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Job ID to cancel" },
        },
        required: ["job_id"],
      },
    },
    // ── Scheduling ──
    {
      name: "brain_schedule",
      description: "Schedule an agent operation (immediately starts the operation and returns a job_id)",
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["structure", "compile", "lint", "enhance", "query"],
            description: "Operation to run",
          },
          prompt: { type: "string", description: "User prompt for the operation" },
        },
        required: ["operation"],
      },
    },
    // ── Export ──
    {
      name: "brain_export",
      description: "Export brain file manifest or metadata summary",
      inputSchema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["json", "manifest"],
            description: "Export format: 'json' for full summary, 'manifest' for file list only",
          },
        },
      },
    },
  ];
}
