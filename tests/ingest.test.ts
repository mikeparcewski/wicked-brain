import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../src/brain.js";
import { ingestFile, safeSourceName } from "../src/ingest.js";

let tmpDir: string;
let brain: BrainHandle;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-ingest-"));
  const brainDir = path.join(tmpDir, "brain");
  await BrainHandle.init(brainDir, { id: "test-brain", name: "Test" });
  brain = await BrainHandle.open(brainDir);
});

afterEach(() => {
  brain.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("safeSourceName", () => {
  it("lowercases and replaces non-alphanumeric with hyphens", () => {
    expect(safeSourceName("Hello World.md")).toBe("hello-world-md");
    expect(safeSourceName("My File (2024).txt")).toBe("my-file-2024-txt");
    expect(safeSourceName("test__file")).toBe("test-file");
  });

  it("dedupes hyphens", () => {
    expect(safeSourceName("a--b---c")).toBe("a-b-c");
  });

  it("trims leading/trailing hyphens", () => {
    expect(safeSourceName("-test-")).toBe("test");
  });
});

describe("ingestFile", () => {
  it("ingests a markdown file and creates chunks", async () => {
    const rawDir = path.join(brain.root, "raw");
    const mdContent = `# Introduction

This is the introduction section with some content about the topic.

## Details

More details about the subject matter here.
`;
    await fsp.writeFile(path.join(rawDir, "test.md"), mdContent, "utf-8");

    const result = await ingestFile(brain, "raw/test.md");

    expect(result.source_name).toBe("raw-test-md");
    expect(result.chunks_created).toBeGreaterThan(0);
    expect(result.skipped).toBeUndefined();

    // Check chunk files were created
    const extractedDir = path.join(
      brain.root,
      "chunks",
      "extracted",
      "raw-test-md"
    );
    const files = await fsp.readdir(extractedDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/chunk-\d{3}\.md/);
  });

  it("ingests a plain text file and creates chunks", async () => {
    const rawDir = path.join(brain.root, "raw");
    const txtContent = `First paragraph of text with enough words to test.

Second paragraph with different content about something else entirely.
`;
    await fsp.writeFile(path.join(rawDir, "notes.txt"), txtContent, "utf-8");

    const result = await ingestFile(brain, "raw/notes.txt");

    expect(result.source_name).toBe("raw-notes-txt");
    expect(result.chunks_created).toBeGreaterThan(0);
  });

  it("skips unchanged file on re-ingest", async () => {
    const rawDir = path.join(brain.root, "raw");
    const content = "Some content that won't change.";
    await fsp.writeFile(path.join(rawDir, "stable.md"), content, "utf-8");

    // First ingest
    await ingestFile(brain, "raw/stable.md");

    // Second ingest — same content, same hash
    const result = await ingestFile(brain, "raw/stable.md");

    expect(result.skipped).toBe(true);
    expect(result.chunks_created).toBe(0);
  });

  it("archives old chunks on re-ingest with changed content", async () => {
    const rawDir = path.join(brain.root, "raw");
    await fsp.writeFile(path.join(rawDir, "doc.md"), "Original content here.", "utf-8");

    // First ingest
    await ingestFile(brain, "raw/doc.md");

    // Modify the file
    await fsp.writeFile(path.join(rawDir, "doc.md"), "Updated content here.", "utf-8");

    // Second ingest — different content
    const result = await ingestFile(brain, "raw/doc.md");

    expect(result.archived).toBe(true);
    expect(result.chunks_created).toBeGreaterThan(0);

    // Check an archived directory exists
    const extractedParent = path.join(brain.root, "chunks", "extracted");
    const dirs = await fsp.readdir(extractedParent);
    const archivedDirs = dirs.filter((d) => d.includes(".archived-"));
    expect(archivedDirs.length).toBeGreaterThan(0);
  });

  it("indexes chunks into search", async () => {
    const rawDir = path.join(brain.root, "raw");
    await fsp.writeFile(
      path.join(rawDir, "search-test.md"),
      "This document is about elephants and their habitat.",
      "utf-8"
    );

    await ingestFile(brain, "raw/search-test.md");

    const results = await brain.search.search({ query: "elephants" });
    expect(results.results.length).toBeGreaterThan(0);
  });

  it("logs write events to event log", async () => {
    const rawDir = path.join(brain.root, "raw");
    await fsp.writeFile(
      path.join(rawDir, "logged.md"),
      "Content to be logged.",
      "utf-8"
    );

    await ingestFile(brain, "raw/logged.md");

    const events = await brain.eventLog.readAll();
    const writeEvents = events.filter((e) => e.op === "write");
    expect(writeEvents.length).toBeGreaterThan(0);
  });

  it("writes chunk frontmatter with correct fields", async () => {
    const rawDir = path.join(brain.root, "raw");
    await fsp.writeFile(
      path.join(rawDir, "frontmatter-test.md"),
      "Some content here.",
      "utf-8"
    );

    await ingestFile(brain, "raw/frontmatter-test.md");

    const chunkDir = path.join(
      brain.root,
      "chunks",
      "extracted",
      "raw-frontmatter-test-md"
    );
    const files = await fsp.readdir(chunkDir);
    const chunkContent = await fsp.readFile(
      path.join(chunkDir, files[0]),
      "utf-8"
    );

    expect(chunkContent).toContain("source:");
    expect(chunkContent).toContain("source_type:");
    expect(chunkContent).toContain("chunk_id:");
    expect(chunkContent).toContain("confidence:");
    expect(chunkContent).toContain("indexed_at:");
  });

  it("throws if file does not exist", async () => {
    await expect(ingestFile(brain, "raw/nonexistent.md")).rejects.toThrow(
      "File not found"
    );
  });
});
