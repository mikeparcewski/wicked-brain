import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../../src/brain.js";
import { BrainPath } from "../../src/brain-path.js";
import { createBrainTools } from "../../src/agent/tools.js";

let tmpDir: string;
let brain: BrainHandle;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-tools-"));
  const brainDir = path.join(tmpDir, "brain");
  await BrainHandle.init(brainDir, { id: "test-brain", name: "Test Brain" });
  brain = await BrainHandle.open(brainDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createBrainTools", () => {
  it("returns exactly 11 tools", () => {
    const tools = createBrainTools(brain);
    expect(tools).toHaveLength(11);
  });

  it("has correct tool names", () => {
    const tools = createBrainTools(brain);
    const names = tools.map((t) => t.name);
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

  it("each tool has required fields: name, label, description, parameters, execute", () => {
    const tools = createBrainTools(brain);
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    }
  });

  describe("brain_search", () => {
    it("returns search results structure", async () => {
      const tools = createBrainTools(brain);
      const searchTool = tools.find((t) => t.name === "brain_search")!;

      const result = await searchTool.execute("call-1", { query: "test" }, undefined, undefined);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty("results");
      expect(parsed).toHaveProperty("total_matches");
    });
  });

  describe("brain_read", () => {
    it("reads at depth 0 and returns stats only", async () => {
      const brainDir = brain.root;
      await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
      await fsp.writeFile(
        path.join(brainDir, "wiki", "test.md"),
        "# Test\n\nSome content here.",
        "utf-8"
      );

      const tools = createBrainTools(brain);
      const readTool = tools.find((t) => t.name === "brain_read")!;

      const result = await readTool.execute("call-1", { path: "wiki/test.md", depth: 0 }, undefined, undefined);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.path).toBe("wiki/test.md");
      expect(parsed.word_count).toBeGreaterThan(0);
      expect(parsed.truncated).toBe(true);
      expect(parsed.content).toBeUndefined();
    });

    it("reads at depth 2 and returns full content", async () => {
      const brainDir = brain.root;
      await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
      await fsp.writeFile(
        path.join(brainDir, "wiki", "test.md"),
        "# Test\n\nSome content here.",
        "utf-8"
      );

      const tools = createBrainTools(brain);
      const readTool = tools.find((t) => t.name === "brain_read")!;

      const result = await readTool.execute("call-1", { path: "wiki/test.md", depth: 2 }, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content).toBeDefined();
      expect(parsed.content).toContain("Some content");
    });
  });

  describe("brain_write", () => {
    it("writes content and returns a receipt", async () => {
      const tools = createBrainTools(brain);
      const writeTool = tools.find((t) => t.name === "brain_write")!;

      const result = await writeTool.execute("call-1", {
        path: "wiki/new-file.md",
        content: "# New File\n\nContent here.",
      }, undefined, undefined);

      expect(result.content).toHaveLength(1);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty("path");
      expect(parsed).toHaveProperty("content_hash");
      expect(parsed).toHaveProperty("written_at");
    });
  });

  describe("brain_status", () => {
    it("returns stats and config", async () => {
      const tools = createBrainTools(brain);
      const statusTool = tools.find((t) => t.name === "brain_status")!;

      const result = await statusTool.execute("call-1", {}, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty("stats");
      expect(parsed).toHaveProperty("config");
      expect(parsed.config.id).toBe("test-brain");
    });
  });

  describe("brain_list", () => {
    it("lists files in a directory", async () => {
      const brainDir = brain.root;
      await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
      await fsp.writeFile(path.join(brainDir, "wiki", "a.md"), "a", "utf-8");
      await fsp.writeFile(path.join(brainDir, "wiki", "b.md"), "b", "utf-8");

      const tools = createBrainTools(brain);
      const listTool = tools.find((t) => t.name === "brain_list")!;

      const result = await listTool.execute("call-1", { path: "wiki" }, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("brain_diff", () => {
    it("returns event log entries", async () => {
      const tools = createBrainTools(brain);
      const writeTool = tools.find((t) => t.name === "brain_write")!;
      await writeTool.execute("call-1", { path: "wiki/file.md", content: "content" }, undefined, undefined);

      const diffTool = tools.find((t) => t.name === "brain_diff")!;
      const result = await diffTool.execute("call-2", {}, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });
  });

  describe("brain_resolve", () => {
    it("returns exists=false for non-existent path", async () => {
      const tools = createBrainTools(brain);
      const resolveTool = tools.find((t) => t.name === "brain_resolve")!;

      const result = await resolveTool.execute("call-1", { ref: "wiki/missing.md" }, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.exists).toBe(false);
    });

    it("returns exists=true for existing path", async () => {
      const brainDir = brain.root;
      await fsp.mkdir(path.join(brainDir, "wiki"), { recursive: true });
      await fsp.writeFile(path.join(brainDir, "wiki", "exists.md"), "content", "utf-8");

      const tools = createBrainTools(brain);
      const resolveTool = tools.find((t) => t.name === "brain_resolve")!;

      const result = await resolveTool.execute("call-1", { ref: "wiki/exists.md" }, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.exists).toBe(true);
    });
  });

  describe("brain_backlinks", () => {
    it("returns empty array for path with no backlinks", async () => {
      const tools = createBrainTools(brain);
      const backlinksTool = tools.find((t) => t.name === "brain_backlinks")!;

      const result = await backlinksTool.execute("call-1", { path: "wiki/no-links.md" }, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("brain_forward_links", () => {
    it("returns empty array for path with no forward links", async () => {
      const tools = createBrainTools(brain);
      const fwLinksTool = tools.find((t) => t.name === "brain_forward_links")!;

      const result = await fwLinksTool.execute("call-1", { path: "wiki/no-links.md" }, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("brain_lint", () => {
    it("returns issues array", async () => {
      const tools = createBrainTools(brain);
      const lintTool = tools.find((t) => t.name === "brain_lint")!;

      const result = await lintTool.execute("call-1", {}, undefined, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty("issues");
      expect(Array.isArray(parsed.issues)).toBe(true);
    });
  });
});
