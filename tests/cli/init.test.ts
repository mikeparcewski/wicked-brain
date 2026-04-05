import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { parseFlags } from "../../src/cli.js";

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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-cli-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseFlags", () => {
  it("extracts positional args", () => {
    const result = parseFlags(["foo", "bar"]);
    expect(result.positional).toEqual(["foo", "bar"]);
    expect(result.flags).toEqual({});
  });

  it("extracts --key value flags", () => {
    const result = parseFlags(["--name", "TestBrain"]);
    expect(result.flags.name).toBe("TestBrain");
    expect(result.positional).toEqual([]);
  });

  it("extracts boolean --flag", () => {
    const result = parseFlags(["--json"]);
    expect(result.flags.json).toBe(true);
  });

  it("mixes positional and flags", () => {
    const result = parseFlags(["mydir", "--name", "Test", "--json"]);
    expect(result.positional).toEqual(["mydir"]);
    expect(result.flags.name).toBe("Test");
    expect(result.flags.json).toBe(true);
  });
});

describe("CLI init command", () => {
  it("initializes a brain at the given directory", () => {
    const brainDir = path.join(tmpDir, "mybrain");
    runCli(["init", brainDir, "--name", "Test Brain"]);

    const configPath = path.join(brainDir, "brain.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.name).toBe("Test Brain");
    expect(config.id).toBe("mybrain");
    expect(config.schema).toBe(1);
  }, T);

  it("creates required directory structure", () => {
    const brainDir = path.join(tmpDir, "testbrain");
    runCli(["init", brainDir]);

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
      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    }
  }, T);

  it("outputs JSON when --json flag is set", () => {
    const brainDir = path.join(tmpDir, "jsonbrain");
    const output = runCli(["init", brainDir, "--name", "JSON Brain", "--json"]);
    const parsed = JSON.parse(output.trim());
    expect(parsed.ok).toBe(true);
    expect(parsed.name).toBe("JSON Brain");
    expect(parsed.id).toBe("jsonbrain");
  }, T);

  it("uses directory basename as id when --id not provided", () => {
    const brainDir = path.join(tmpDir, "auto-id-brain");
    runCli(["init", brainDir]);

    const config = JSON.parse(
      fs.readFileSync(path.join(brainDir, "brain.json"), "utf-8")
    );
    expect(config.id).toBe("auto-id-brain");
  }, T);

  it("uses directory basename as name when --name not provided", () => {
    const brainDir = path.join(tmpDir, "default-name");
    runCli(["init", brainDir]);

    const config = JSON.parse(
      fs.readFileSync(path.join(brainDir, "brain.json"), "utf-8")
    );
    expect(config.name).toBe("default-name");
  }, T);
});
