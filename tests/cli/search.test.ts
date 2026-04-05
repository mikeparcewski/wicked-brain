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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-search-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("CLI search command", () => {
  it("returns empty results when brain has no documents", () => {
    const brainDir = path.join(tmpDir, "emptybrain");
    runCli(["init", brainDir, "--name", "Test"]);

    const output = runCli(["search", "hello", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());

    expect(result.results).toEqual([]);
    expect(result.total_matches).toBe(0);
  }, T);

  it("finds ingested content", async () => {
    const brainDir = path.join(tmpDir, "searchbrain");
    runCli(["init", brainDir, "--name", "Test"]);

    const rawFile = path.join(brainDir, "raw", "knowledge.txt");
    await fsp.writeFile(
      rawFile,
      "The quantum computer uses qubits instead of classical bits. Quantum entanglement enables superposition.",
      "utf-8"
    );
    runCli(["ingest", "raw/knowledge.txt", "--brain", brainDir]);

    const output = runCli(["search", "quantum", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());

    expect(result.total_matches).toBeGreaterThan(0);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]).toHaveProperty("path");
    expect(result.results[0]).toHaveProperty("score");
  }, T);

  it("supports --limit flag", async () => {
    const brainDir = path.join(tmpDir, "limitbrain");
    runCli(["init", brainDir, "--name", "Test"]);

    const rawFile = path.join(brainDir, "raw", `doc0.txt`);
    await fsp.writeFile(rawFile, `Document 0 contains information about search results.`, "utf-8");
    runCli(["ingest", `raw/doc0.txt`, "--brain", brainDir]);

    const output = runCli(["search", "search results", "--brain", brainDir, "--limit", "1", "--json"]);
    const result = JSON.parse(output.trim());

    expect(result.results.length).toBeLessThanOrEqual(1);
  }, T);

  it("outputs human-readable text without --json flag", () => {
    const brainDir = path.join(tmpDir, "humanbrain");
    runCli(["init", brainDir, "--name", "Test"]);

    const output = runCli(["search", "anything", "--brain", brainDir]);
    expect(output).toContain("No results");
  }, T);
});
