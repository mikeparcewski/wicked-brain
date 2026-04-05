import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../src/brain.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("BrainHandle.init", () => {
  it("creates brain.json with correct config", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-1", name: "My Brain" });

    const configPath = path.join(brainDir, "brain.json");
    const content = await fsp.readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config.id).toBe("brain-1");
    expect(config.name).toBe("My Brain");
    expect(config.schema).toBe(1);
    expect(config.parents).toEqual([]);
    expect(config.links).toEqual([]);
    expect(config.plugins).toEqual([]);
    expect(config.models).toEqual({});
  });

  it("creates required directory structure", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-1", name: "My Brain" });

    const expectedDirs = [
      brainDir,
      path.join(brainDir, "raw"),
      path.join(brainDir, "chunks", "extracted"),
      path.join(brainDir, "chunks", "inferred"),
      path.join(brainDir, "wiki"),
      path.join(brainDir, "_meta"),
      path.join(brainDir, "_ops"),
    ];

    for (const dir of expectedDirs) {
      const stat = await fsp.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    }
  });

  it("stores optional fields when provided", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, {
      id: "brain-2",
      name: "Test Brain",
      parents: ["parent-1"],
      links: ["link-1"],
      plugins: ["plugin-a"],
      models: { default: { provider: "openai", model: "gpt-4" } },
    });

    const config = JSON.parse(
      await fsp.readFile(path.join(brainDir, "brain.json"), "utf-8")
    );

    expect(config.parents).toEqual(["parent-1"]);
    expect(config.links).toEqual(["link-1"]);
    expect(config.plugins).toEqual(["plugin-a"]);
    expect(config.models.default.provider).toBe("openai");
  });
});

describe("BrainHandle.open", () => {
  it("opens a brain and reads config", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-1", name: "My Brain" });

    const brain = await BrainHandle.open(brainDir);
    try {
      const config = brain.config();
      expect(config.id).toBe("brain-1");
      expect(config.name).toBe("My Brain");
      expect(config.schema).toBe(1);
    } finally {
      brain.close();
    }
  });

  it("throws if brain.json is missing", async () => {
    const brainDir = path.join(tmpDir, "nonexistent");
    await expect(BrainHandle.open(brainDir)).rejects.toThrow(
      "No brain.json found"
    );
  });

  it("provides storage adapter", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-1", name: "My Brain" });

    const brain = await BrainHandle.open(brainDir);
    try {
      expect(brain.storage).toBeDefined();
    } finally {
      brain.close();
    }
  });

  it("provides search adapter", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-1", name: "My Brain" });

    const brain = await BrainHandle.open(brainDir);
    try {
      expect(brain.search).toBeDefined();
    } finally {
      brain.close();
    }
  });

  it("provides eventLog", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-1", name: "My Brain" });

    const brain = await BrainHandle.open(brainDir);
    try {
      expect(brain.eventLog).toBeDefined();
      expect(brain.eventLog.path).toContain("log.jsonl");
    } finally {
      brain.close();
    }
  });

  it("provides lock", async () => {
    const brainDir = path.join(tmpDir, "mybrain");
    await BrainHandle.init(brainDir, { id: "brain-1", name: "My Brain" });

    const brain = await BrainHandle.open(brainDir);
    try {
      expect(brain.lock).toBeDefined();
    } finally {
      brain.close();
    }
  });
});
