import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

// Each CLI call spawns tsx which takes ~1.5-2s to start
const T = 30000;

const CLI_PATH = path.resolve("src/cli.ts");

function runCli(args: string[], opts?: { allowFailure?: boolean }): string {
  try {
    return execFileSync("npx", ["tsx", CLI_PATH, ...args], {
      encoding: "utf-8",
      cwd: process.cwd(),
      timeout: 30000,
    });
  } catch (err: unknown) {
    if (opts?.allowFailure) {
      const e = err as { stdout?: string; stderr?: string };
      return (e.stdout ?? "") + (e.stderr ?? "");
    }
    throw err;
  }
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-cmds-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---- status ----
describe("CLI status command", () => {
  it("shows brain config info", () => {
    const brainDir = path.join(tmpDir, "statbrain");
    runCli(["init", brainDir, "--name", "Status Brain"]);
    const output = runCli(["status", "--brain", brainDir]);
    expect(output).toContain("Status Brain");
    expect(output).toContain("statbrain");
  }, T);

  it("outputs JSON with config and stats", () => {
    const brainDir = path.join(tmpDir, "statjson");
    runCli(["init", brainDir, "--name", "JSON Status"]);
    const output = runCli(["status", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());
    expect(result.config).toBeDefined();
    expect(result.config.name).toBe("JSON Status");
    expect(result.stats).toBeDefined();
    expect(result.stats).toHaveProperty("total_documents");
  }, T);
});

// ---- list ----
describe("CLI list command", () => {
  it("returns empty list for fresh brain", () => {
    const brainDir = path.join(tmpDir, "listbrain");
    runCli(["init", brainDir, "--name", "List Brain"]);
    const output = runCli(["list", "chunks", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());
    expect(Array.isArray(result)).toBe(true);
  }, T);

  it("lists files after ingest", async () => {
    const brainDir = path.join(tmpDir, "listingest");
    runCli(["init", brainDir, "--name", "Test"]);
    const rawFile = path.join(brainDir, "raw", "article.txt");
    await fsp.writeFile(rawFile, "Some article content to ingest.", "utf-8");
    runCli(["ingest", "raw/article.txt", "--brain", brainDir]);
    const output = runCli(["list", "chunks", "--brain", brainDir, "--json", "--recursive"]);
    const result = JSON.parse(output.trim());
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain("chunks/");
  }, T);
});

// ---- lint ----
describe("CLI lint command", () => {
  it("shows no issues for fresh brain", () => {
    const brainDir = path.join(tmpDir, "lintbrain");
    runCli(["init", brainDir, "--name", "Lint Brain"]);
    const output = runCli(["lint", "--brain", brainDir]);
    expect(output).toContain("No issues");
  }, T);

  it("outputs JSON with issues array", () => {
    const brainDir = path.join(tmpDir, "lintjson");
    runCli(["init", brainDir, "--name", "Lint JSON"]);
    const output = runCli(["lint", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.total).toBe(0);
  }, T);
});

// ---- diff ----
describe("CLI diff command", () => {
  it("shows no changes for fresh brain", () => {
    const brainDir = path.join(tmpDir, "diffbrain");
    runCli(["init", brainDir, "--name", "Diff Brain"]);
    const output = runCli(["diff", "--brain", brainDir]);
    expect(output).toContain("No changes");
  }, T);

  it("shows changes after ingest", async () => {
    const brainDir = path.join(tmpDir, "difflog");
    runCli(["init", brainDir, "--name", "Diff Log"]);
    const rawFile = path.join(brainDir, "raw", "new.txt");
    await fsp.writeFile(rawFile, "New document for diff testing.", "utf-8");
    runCli(["ingest", "raw/new.txt", "--brain", brainDir]);
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    const output = runCli(["diff", "--brain", brainDir, "--since", since]);
    expect(output).toContain("write");
  }, T);
});

// ---- link / parent / unlink ----
describe("CLI link commands", () => {
  it("adds a link to brain.json", () => {
    const brainDir = path.join(tmpDir, "linkbrain");
    runCli(["init", brainDir, "--name", "Link Brain"]);
    runCli(["link", "../otherbrain", "--brain", brainDir]);
    const config = JSON.parse(
      fs.readFileSync(path.join(brainDir, "brain.json"), "utf-8")
    );
    expect(config.links).toContain("../otherbrain");
  }, T);

  it("adds a parent to brain.json", () => {
    const brainDir = path.join(tmpDir, "parentbrain");
    runCli(["init", brainDir, "--name", "Parent Brain"]);
    runCli(["parent", "../parentbrain2", "--brain", brainDir]);
    const config = JSON.parse(
      fs.readFileSync(path.join(brainDir, "brain.json"), "utf-8")
    );
    expect(config.parents).toContain("../parentbrain2");
  }, T);

  it("removes a link via unlink", () => {
    const brainDir = path.join(tmpDir, "unlinkbrain");
    runCli(["init", brainDir, "--name", "Unlink Brain"]);
    runCli(["link", "../to-remove", "--brain", brainDir]);
    runCli(["unlink", "../to-remove", "--brain", brainDir]);
    const config = JSON.parse(
      fs.readFileSync(path.join(brainDir, "brain.json"), "utf-8")
    );
    expect(config.links).not.toContain("../to-remove");
  }, T);

  it("returns JSON for link command with --json flag", () => {
    const brainDir = path.join(tmpDir, "linkjson");
    runCli(["init", brainDir, "--name", "Link JSON"]);
    const output = runCli(["link", "../target", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());
    expect(result.ok).toBe(true);
    expect(result.action).toBe("link");
  }, T);
});

// ---- rebuild-meta ----
describe("CLI rebuild-meta command", () => {
  it("rebuilds meta files", () => {
    const brainDir = path.join(tmpDir, "metabrain");
    runCli(["init", brainDir, "--name", "Meta Brain"]);
    const output = runCli(["rebuild-meta", "--brain", brainDir]);
    expect(output).toContain("Meta rebuilt");
    expect(fs.existsSync(path.join(brainDir, "_meta", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(brainDir, "_meta", "tags.json"))).toBe(true);
  }, T);

  it("outputs JSON when --json flag is set", () => {
    const brainDir = path.join(tmpDir, "metajson");
    runCli(["init", brainDir, "--name", "Meta JSON"]);
    const output = runCli(["rebuild-meta", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());
    expect(result.ok).toBe(true);
  }, T);
});

// ---- rebuild-index ----
describe("CLI rebuild-index command", () => {
  it("rebuilds search index", () => {
    const brainDir = path.join(tmpDir, "indexbrain");
    runCli(["init", brainDir, "--name", "Index Brain"]);
    const output = runCli(["rebuild-index", "--brain", brainDir]);
    expect(output).toContain("Reindexed");
  }, T);

  it("outputs JSON when --json flag is set", () => {
    const brainDir = path.join(tmpDir, "indexjson");
    runCli(["init", brainDir, "--name", "Index JSON"]);
    const output = runCli(["rebuild-index", "--brain", brainDir, "--json"]);
    const result = JSON.parse(output.trim());
    expect(result.ok).toBe(true);
    expect(typeof result.indexed).toBe("number");
  }, T);
});

// ---- export ----
describe("CLI export command", () => {
  it("exports brain metadata as JSON by default", () => {
    const brainDir = path.join(tmpDir, "exportbrain");
    runCli(["init", brainDir, "--name", "Export Brain"]);
    const output = runCli(["export", "--brain", brainDir]);
    const result = JSON.parse(output.trim());
    expect(result.config).toBeDefined();
    expect(result.config.name).toBe("Export Brain");
    expect(result.stats).toBeDefined();
    expect(result.exported_at).toBeDefined();
  }, T);

  it("exports as markdown with --format markdown", () => {
    const brainDir = path.join(tmpDir, "exportmd");
    runCli(["init", brainDir, "--name", "MD Export"]);
    const output = runCli(["export", "--brain", brainDir, "--format", "markdown"]);
    expect(output).toContain("# Brain Export: MD Export");
    expect(output).toContain("## Stats");
  }, T);
});

// ---- stub commands ----
describe("CLI agent commands (Phase 5)", () => {
  it("compile --dry-run prints dry-run message", () => {
    const output = runCli(["compile", "--brain", tmpDir, "--dry-run"]);
    expect(output).toContain("dry-run");
  }, T);

  it("structure --dry-run prints dry-run message", () => {
    const output = runCli(["structure", "--brain", tmpDir, "--dry-run"]);
    expect(output).toContain("dry-run");
  }, T);

  it("enhance --dry-run prints dry-run message", () => {
    const output = runCli(["enhance", "--brain", tmpDir, "--dry-run"]);
    expect(output).toContain("dry-run");
  }, T);

  it("jobs lists no jobs for a fresh brain", () => {
    const output = runCli(["jobs", "--brain", tmpDir]);
    expect(output).toContain("No jobs found");
  }, T);

  it("schedule prints agent message", () => {
    const output = runCli(["schedule"]);
    expect(output).toContain("Requires agent operations");
  }, T);
});

// ---- read command ----
describe("CLI read command", () => {
  it("reads a file at depth 1 (summary + sections)", async () => {
    const brainDir = path.join(tmpDir, "readbrain");
    runCli(["init", brainDir, "--name", "Read Brain"]);
    const rawFile = path.join(brainDir, "raw", "readme.md");
    await fsp.writeFile(
      rawFile,
      "# Introduction\n\nThis is an intro paragraph.\n\n## Details\n\nMore details here.",
      "utf-8"
    );
    runCli(["ingest", "raw/readme.md", "--brain", brainDir]);
    const chunksDir = path.join(brainDir, "chunks", "extracted");
    const sourceDirs = fs.readdirSync(chunksDir);
    expect(sourceDirs.length).toBeGreaterThan(0);
    const chunkFiles = fs.readdirSync(path.join(chunksDir, sourceDirs[0]));
    const chunkPath = `chunks/extracted/${sourceDirs[0]}/${chunkFiles[0]}`;
    const output = runCli(["read", chunkPath, "--brain", brainDir, "--depth", "1"]);
    expect(output).toContain("Path:");
    expect(output).toContain("Words:");
  }, T);

  it("outputs JSON at depth 0", async () => {
    const brainDir = path.join(tmpDir, "readjson");
    runCli(["init", brainDir, "--name", "Read JSON"]);
    const rawFile = path.join(brainDir, "raw", "data.txt");
    await fsp.writeFile(rawFile, "Some data for reading.", "utf-8");
    runCli(["ingest", "raw/data.txt", "--brain", brainDir]);
    const chunksDir = path.join(brainDir, "chunks", "extracted");
    const sourceDirs = fs.readdirSync(chunksDir);
    const chunkFiles = fs.readdirSync(path.join(chunksDir, sourceDirs[0]));
    const chunkPath = `chunks/extracted/${sourceDirs[0]}/${chunkFiles[0]}`;
    const output = runCli(["read", chunkPath, "--brain", brainDir, "--depth", "0", "--json"]);
    const result = JSON.parse(output.trim());
    expect(result).toHaveProperty("path");
    expect(result).toHaveProperty("word_count");
    expect(result.truncated).toBe(true);
  }, T);
});
