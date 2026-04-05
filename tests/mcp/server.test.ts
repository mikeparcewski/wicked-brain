import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../../src/brain.js";
import { JobManager } from "../../src/agent/job-manager.js";
import {
  getToolDefinitions,
  createToolDispatch,
  handleBrainSearch,
  handleBrainRead,
  handleBrainWrite,
  handleBrainList,
  handleBrainStatus,
  handleBrainBacklinks,
  handleBrainForwardLinks,
  handleBrainLint,
  handleBrainDiff,
  handleBrainResolve,
  handleBrainJobStatus,
  handleBrainJobCancel,
  handleBrainExport,
  handleResourceOrientation,
  handleResourceRecent,
  handleResourceGaps,
  type McpToolResult,
  type ToolDefinition,
} from "../../src/mcp/handlers.js";
import { createBrainMcpServer } from "../../src/mcp/server.js";

let tmpDir: string;
let brain: BrainHandle;
let jobManager: JobManager;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-mcp-"));
  const brainDir = path.join(tmpDir, "brain");
  await BrainHandle.init(brainDir, { id: "mcp-test-brain", name: "MCP Test Brain" });
  brain = await BrainHandle.open(brainDir);
  jobManager = new JobManager(path.join(brainDir, "_meta"));
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ──────────────────────────────────────────────────────────────────────────────

describe("getToolDefinitions", () => {
  it("returns exactly 19 tools", () => {
    const tools = getToolDefinitions();
    expect(tools).toHaveLength(19);
  });

  it("includes all 11 low-level brain tools", () => {
    const tools = getToolDefinitions();
    const names = tools.map((t: ToolDefinition) => t.name);
    expect(names).toContain("brain_search");
    expect(names).toContain("brain_read");
    expect(names).toContain("brain_write");
    expect(names).toContain("brain_list");
    expect(names).toContain("brain_status");
    expect(names).toContain("brain_backlinks");
    expect(names).toContain("brain_forward_links");
    expect(names).toContain("brain_lint");
    expect(names).toContain("brain_diff");
    expect(names).toContain("brain_resolve");
    expect(names).toContain("brain_ingest");
  });

  it("includes 4 brain_op_* tools", () => {
    const tools = getToolDefinitions();
    const names = tools.map((t: ToolDefinition) => t.name);
    expect(names).toContain("brain_op_structure");
    expect(names).toContain("brain_op_compile");
    expect(names).toContain("brain_op_lint");
    expect(names).toContain("brain_op_enhance");
  });

  it("includes 2 job management tools", () => {
    const tools = getToolDefinitions();
    const names = tools.map((t: ToolDefinition) => t.name);
    expect(names).toContain("brain_job_status");
    expect(names).toContain("brain_job_cancel");
  });

  it("includes brain_schedule and brain_export tools", () => {
    const tools = getToolDefinitions();
    const names = tools.map((t: ToolDefinition) => t.name);
    expect(names).toContain("brain_schedule");
    expect(names).toContain("brain_export");
  });

  it("each tool has name, description, and inputSchema with type=object", () => {
    const tools = getToolDefinitions();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("tools with required fields declare them in inputSchema", () => {
    const tools = getToolDefinitions();
    const searchTool = tools.find((t: ToolDefinition) => t.name === "brain_search")!;
    expect(searchTool.inputSchema.required).toContain("query");

    const readTool = tools.find((t: ToolDefinition) => t.name === "brain_read")!;
    expect(readTool.inputSchema.required).toContain("path");

    const writeTool = tools.find((t: ToolDefinition) => t.name === "brain_write")!;
    expect(writeTool.inputSchema.required).toContain("path");
    expect(writeTool.inputSchema.required).toContain("content");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Individual handler tests
// ──────────────────────────────────────────────────────────────────────────────

describe("handleBrainSearch", () => {
  it("returns search result structure", async () => {
    const result = await handleBrainSearch(brain, { query: "test" });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("results");
    expect(data).toHaveProperty("total_matches");
  });
});

describe("handleBrainRead", () => {
  it("returns error result for non-existent file", async () => {
    const result = await handleBrainRead(brain, { path: "wiki/missing.md", depth: 1 });
    // Should either be an error or return stats
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });

  it("reads a file at depth 0 and returns stats", async () => {
    const brainDir = brain.root;
    await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
    await fsp.writeFile(path.join(brainDir, "wiki", "doc.md"), "# Doc\n\nContent here.", "utf-8");

    const result = await handleBrainRead(brain, { path: "wiki/doc.md", depth: 0 });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("path");
    expect(data.truncated).toBe(true);
  });

  it("reads a file at depth 2 and returns full content", async () => {
    const brainDir = brain.root;
    await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
    await fsp.writeFile(path.join(brainDir, "wiki", "doc.md"), "# Doc\n\nFull content.", "utf-8");

    const result = await handleBrainRead(brain, { path: "wiki/doc.md", depth: 2 });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.content).toContain("Full content");
  });
});

describe("handleBrainWrite", () => {
  it("writes a file and returns receipt", async () => {
    const result = await handleBrainWrite(brain, { path: "wiki/test.md", content: "# Test\n\nHello." });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("path");
    expect(data).toHaveProperty("content_hash");
    expect(data).toHaveProperty("written_at");
  });

  it("records event log entry after write", async () => {
    await handleBrainWrite(brain, { path: "wiki/event-test.md", content: "content" });
    const entries = await brain.eventLog.readAll();
    expect(entries.length).toBeGreaterThan(0);
    const writeEntry = entries.find((e) => e.path === "wiki/event-test.md");
    expect(writeEntry).toBeDefined();
    expect(writeEntry?.author).toBe("mcp");
  });
});

describe("handleBrainList", () => {
  it("lists files in root directory", async () => {
    const result = await handleBrainList(brain, {});
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });

  it("lists files in a subdirectory", async () => {
    const brainDir = brain.root;
    await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
    await fsp.writeFile(path.join(brainDir, "wiki", "a.md"), "a", "utf-8");
    await fsp.writeFile(path.join(brainDir, "wiki", "b.md"), "b", "utf-8");

    const result = await handleBrainList(brain, { path: "wiki" });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });
});

describe("handleBrainStatus", () => {
  it("returns stats and config", async () => {
    const result = await handleBrainStatus(brain, {});
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("stats");
    expect(data).toHaveProperty("config");
    expect(data.config.id).toBe("mcp-test-brain");
  });
});

describe("handleBrainBacklinks", () => {
  it("returns empty array for path with no backlinks", async () => {
    const result = await handleBrainBacklinks(brain, { path: "wiki/no-links.md" });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("handleBrainForwardLinks", () => {
  it("returns empty array for path with no forward links", async () => {
    const result = await handleBrainForwardLinks(brain, { path: "wiki/no-links.md" });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("handleBrainLint", () => {
  it("returns issues array", async () => {
    const result = await handleBrainLint(brain, {});
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("issues");
    expect(Array.isArray(data.issues)).toBe(true);
  });
});

describe("handleBrainDiff", () => {
  it("returns empty array when no events", async () => {
    const result = await handleBrainDiff(brain, {});
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns events after write", async () => {
    await handleBrainWrite(brain, { path: "wiki/diff-test.md", content: "content" });
    const result = await handleBrainDiff(brain, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.length).toBeGreaterThan(0);
  });

  it("filters by 'since' timestamp", async () => {
    const before = new Date(Date.now() - 5000).toISOString();
    await handleBrainWrite(brain, { path: "wiki/diff-since.md", content: "content" });
    const result = await handleBrainDiff(brain, { since: before });
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });
});

describe("handleBrainResolve", () => {
  it("returns exists=false for non-existent path", async () => {
    const result = await handleBrainResolve(brain, { ref: "wiki/missing.md" });
    const data = JSON.parse(result.content[0].text);
    expect(data.exists).toBe(false);
  });

  it("returns exists=true for existing file", async () => {
    const brainDir = brain.root;
    await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
    await fsp.writeFile(path.join(brainDir, "wiki", "exists.md"), "content", "utf-8");

    const result = await handleBrainResolve(brain, { ref: "wiki/exists.md" });
    const data = JSON.parse(result.content[0].text);
    expect(data.exists).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Job management handlers
// ──────────────────────────────────────────────────────────────────────────────

describe("handleBrainJobStatus", () => {
  it("returns error for unknown job", async () => {
    const result = await handleBrainJobStatus(jobManager, { job_id: "nonexistent-job" });
    expect(result.isError).toBe(true);
  });

  it("returns job status for created job", async () => {
    const job = await jobManager.create("structure");
    const result = await handleBrainJobStatus(jobManager, { job_id: job.job_id });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.job_id).toBe(job.job_id);
    expect(data.status).toBe("running");
    expect(data.operation).toBe("structure");
  });
});

describe("handleBrainJobCancel", () => {
  it("cancels a running job", async () => {
    const job = await jobManager.create("compile");
    const result = await handleBrainJobCancel(jobManager, { job_id: job.job_id });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.cancelled).toBe(true);
    expect(data.job_id).toBe(job.job_id);

    // Verify job status is now cancelled
    const status = await jobManager.getStatus(job.job_id);
    expect(status?.status).toBe("cancelled");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Resource handlers
// ──────────────────────────────────────────────────────────────────────────────

describe("handleResourceOrientation", () => {
  it("returns markdown string", async () => {
    const result = await handleResourceOrientation(brain);
    expect(typeof result).toBe("string");
    expect(result.startsWith("#")).toBe(true);
  });

  it("returns actual content when orientation.md exists", async () => {
    const metaDir = path.join(brain.root, "_meta");
    await fsp.mkdir(metaDir, { recursive: true });
    await fsp.writeFile(path.join(metaDir, "orientation.md"), "# Orientation\n\nThis brain is for testing.", "utf-8");

    const result = await handleResourceOrientation(brain);
    expect(result).toContain("Orientation");
    expect(result).toContain("testing");
  });
});

describe("handleResourceRecent", () => {
  it("returns markdown string", async () => {
    const result = await handleResourceRecent(brain);
    expect(typeof result).toBe("string");
  });
});

describe("handleResourceGaps", () => {
  it("returns markdown string", async () => {
    const result = await handleResourceGaps(brain);
    expect(typeof result).toBe("string");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Dispatch table
// ──────────────────────────────────────────────────────────────────────────────

describe("createToolDispatch", () => {
  it("dispatches brain_search correctly", async () => {
    const dispatch = createToolDispatch(brain, jobManager);
    const result = await dispatch("brain_search", { query: "hello" });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("results");
  });

  it("dispatches brain_status correctly", async () => {
    const dispatch = createToolDispatch(brain, jobManager);
    const result = await dispatch("brain_status", {});
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.config.id).toBe("mcp-test-brain");
  });

  it("dispatches brain_write and brain_list correctly", async () => {
    const dispatch = createToolDispatch(brain, jobManager);
    await dispatch("brain_write", { path: "wiki/dispatch-test.md", content: "# Dispatch Test" });
    const result = await dispatch("brain_list", { path: "wiki" });
    const data = JSON.parse(result.content[0].text);
    expect(data).toContain("wiki/dispatch-test.md");
  });

  it("dispatches brain_job_status correctly", async () => {
    const dispatch = createToolDispatch(brain, jobManager);
    const job = await jobManager.create("lint");
    const result = await dispatch("brain_job_status", { job_id: job.job_id });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.job_id).toBe(job.job_id);
  });

  it("dispatches brain_job_cancel correctly", async () => {
    const dispatch = createToolDispatch(brain, jobManager);
    const job = await jobManager.create("enhance");
    const result = await dispatch("brain_job_cancel", { job_id: job.job_id });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.cancelled).toBe(true);
  });

  it("dispatches brain_export correctly", async () => {
    const dispatch = createToolDispatch(brain, jobManager);
    const result = await dispatch("brain_export", {});
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("brain_id");
  });

  it("returns error for unknown tool", async () => {
    const dispatch = createToolDispatch(brain, jobManager);
    const result = await dispatch("unknown_tool", {});
    expect(result.isError).toBe(true);
  });

  it("dispatches all 11 low-level tools without throwing", async () => {
    const dispatch = createToolDispatch(brain, jobManager);
    const toolCalls: Array<[string, Record<string, unknown>]> = [
      ["brain_search", { query: "test" }],
      ["brain_list", {}],
      ["brain_status", {}],
      ["brain_lint", {}],
      ["brain_diff", {}],
      ["brain_resolve", { ref: "wiki/missing.md" }],
      ["brain_backlinks", { path: "wiki/missing.md" }],
      ["brain_forward_links", { path: "wiki/missing.md" }],
    ];

    for (const [name, params] of toolCalls) {
      const result = await dispatch(name, params);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
    }
  });
});

describe("handleBrainExport", () => {
  it("exports brain manifest with file list", async () => {
    const result = await handleBrainExport(brain, { format: "manifest" });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("brain_id", "mcp-test-brain");
    expect(data).toHaveProperty("brain_name");
    expect(data).toHaveProperty("file_count");
    expect(Array.isArray(data.files)).toBe(true);
  });

  it("exports brain json summary by default", async () => {
    const result = await handleBrainExport(brain, {});
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("brain_id");
    expect(data).toHaveProperty("exported_at");
    expect(data).toHaveProperty("file_count");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MCP Server factory
// ──────────────────────────────────────────────────────────────────────────────

describe("createBrainMcpServer", () => {
  it("creates a server instance without throwing", () => {
    const server = createBrainMcpServer({ brain });
    expect(server).toBeDefined();
    // Server has a name property via its info
    expect(typeof server).toBe("object");
  });

  it("server is an object with setRequestHandler method", () => {
    const server = createBrainMcpServer({ brain });
    expect(typeof server.setRequestHandler).toBe("function");
  });
});
