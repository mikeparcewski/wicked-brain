import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { LspClient } from "../lib/lsp-client.mjs";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

// Check if typescript-language-server is available
let tsServerAvailable = false;
try {
  execFileSync("which", ["typescript-language-server"], { encoding: "utf-8", timeout: 5000 });
  tsServerAvailable = true;
} catch {
  try {
    execFileSync("where", ["typescript-language-server"], { encoding: "utf-8", timeout: 5000 });
    tsServerAvailable = true;
  } catch { /* not available */ }
}

const testDir = join(import.meta.dirname || ".", "_lsp_test_workspace");

if (tsServerAvailable) {
  before(() => {
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, "_meta"), { recursive: true });
    writeFileSync(join(testDir, "_meta", "config.json"), JSON.stringify({ brain_path: testDir, server_port: 0 }));
    writeFileSync(join(testDir, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2020", module: "ESNext", strict: true }
    }));
    writeFileSync(join(testDir, "test.ts"), [
      "",
      "export class Calculator {",
      "  add(a: number, b: number): number {",
      "    return a + b;",
      "  }",
      "",
      "  multiply(a: number, b: number): number {",
      "    return a * b;",
      "  }",
      "}",
      "",
      "export function useCalculator(): number {",
      "  const calc = new Calculator();",
      "  return calc.add(1, 2);",
      "}",
      ""
    ].join("\n"));
  });

  after(async () => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test("lsp-symbols returns symbols for a TypeScript file", async () => {
    const db = new SqliteSearch(":memory:", "test-brain");
    const client = new LspClient(testDir, db);
    try {
      const result = await client.symbols({ file: join(testDir, "test.ts") });
      assert.ok(result.symbols.length >= 2, `Expected at least 2 symbols, got ${result.symbols.length}`);
      const names = result.symbols.map(s => s.name);
      assert.ok(names.includes("Calculator"), "Should find Calculator class");
      assert.ok(names.includes("useCalculator"), "Should find useCalculator function");
    } finally {
      await client.shutdown();
      db.close();
    }
  });

  test("lsp-definition finds class definition", async () => {
    const db = new SqliteSearch(":memory:", "test-brain");
    const client = new LspClient(testDir, db);
    try {
      // Line 12: "  const calc = new Calculator();" — col 20 hits "Calculator"
      const result = await client.definition({ file: join(testDir, "test.ts"), line: 12, col: 20 });
      assert.ok(result.locations.length >= 1, "Should find at least one definition");
      assert.equal(result.locations[0].line, 1); // class Calculator is on line 1
    } finally {
      await client.shutdown();
      db.close();
    }
  });

  test("lsp-references finds usages", async () => {
    const db = new SqliteSearch(":memory:", "test-brain");
    const client = new LspClient(testDir, db);
    try {
      // Line 2 col 2: "add" method definition
      const result = await client.references({ file: join(testDir, "test.ts"), line: 2, col: 2 });
      assert.ok(result.locations.length >= 2, "Should find definition + usage");
    } finally {
      await client.shutdown();
      db.close();
    }
  });

  test("lsp-hover returns type info", async () => {
    const db = new SqliteSearch(":memory:", "test-brain");
    const client = new LspClient(testDir, db);
    try {
      // Line 12: "  const calc = new Calculator();" — col 20 hits "Calculator"
      const result = await client.hover({ file: join(testDir, "test.ts"), line: 12, col: 20 });
      assert.ok(result.content, "Should return hover content");
      assert.ok(result.content.includes("Calculator"), "Hover should mention Calculator");
    } finally {
      await client.shutdown();
      db.close();
    }
  });

  test("lsp-health shows typescript server running", async () => {
    const db = new SqliteSearch(":memory:", "test-brain");
    const client = new LspClient(testDir, db);
    try {
      // Trigger server spawn
      await client.symbols({ file: join(testDir, "test.ts") });
      const health = client.health();
      assert.ok(health.servers.typescript, "typescript server should be running");
      assert.equal(health.servers.typescript.status, "ready");
    } finally {
      await client.shutdown();
      db.close();
    }
  });

} else {
  test("SKIP: typescript-language-server not installed", () => {
    console.log("Skipping LSP integration tests — install typescript-language-server to run them");
  });
}
