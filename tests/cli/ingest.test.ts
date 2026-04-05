import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

// Each CLI call spawns tsx which takes ~1.5-2s to start
const T = 30000;

const CLI_PATH = path.resolve("src/cli.ts");

function runCli(args: string[]): string {
  return execFileSync("npx", ["tsx", CLI_PATH, ...args], {
    encoding: "utf-8",
    cwd: process.cwd(),
    timeout: 30000,
  });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-ingest-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("CLI ingest command", () => {
  it("ingests a file and creates chunks directory", async () => {
    const brainDir = path.join(tmpDir, "testbrain");
    runCli(["init", brainDir, "--name", "Test"]);

    const rawFile = path.join(brainDir, "raw", "notes.txt");
    await fsp.writeFile(rawFile, "Hello world. This is a test document with some content.", "utf-8");
    runCli(["ingest", "raw/notes.txt", "--brain", brainDir]);

    const chunksDir = path.join(brainDir, "chunks", "extracted");
    expect(fs.existsSync(chunksDir)).toBe(true);

    const entries = fs.readdirSync(chunksDir);
    expect(entries.length).toBeGreaterThan(0);
  }, T);

  it("outputs JSON result when --json flag is set", async () => {
    const brainDir = path.join(tmpDir, "jsonbrain");
    runCli(["init", brainDir, "--name", "Test"]);

    const rawFile = path.join(brainDir, "raw", "doc.md");
    await fsp.writeFile(rawFile, "# Hello\n\nThis is a test document.", "utf-8");

    const output = runCli(["ingest", "raw/doc.md", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());

    expect(result).toHaveProperty("source_name");
    expect(result).toHaveProperty("chunks_created");
    expect(typeof result.chunks_created).toBe("number");
  }, T);

  it("skips already-ingested file with same hash", async () => {
    const brainDir = path.join(tmpDir, "skipbrain");
    runCli(["init", brainDir, "--name", "Test"]);

    const rawFile = path.join(brainDir, "raw", "doc.txt");
    await fsp.writeFile(rawFile, "Same content every time.", "utf-8");

    // First ingest
    runCli(["ingest", "raw/doc.txt", "--brain", brainDir, "--json"]);

    // Second ingest (same content) should skip
    const output2 = runCli(["ingest", "raw/doc.txt", "--brain", brainDir, "--json"]);
    const result2 = JSON.parse(output2.trim());

    expect(result2.skipped).toBe(true);
    expect(result2.chunks_created).toBe(0);
  }, T);

  it("throws error when file path is missing", () => {
    const brainDir = path.join(tmpDir, "brain");
    runCli(["init", brainDir]);

    expect(() => {
      runCli(["ingest", "--brain", brainDir]);
    }).toThrow();
  }, T);
});
