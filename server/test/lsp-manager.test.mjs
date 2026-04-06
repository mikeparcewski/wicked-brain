import { test } from "node:test";
import assert from "node:assert/strict";
import { LspManager } from "../lib/lsp-manager.mjs";

test("findCommand returns path for installed command", () => {
  const manager = new LspManager("/tmp/test-brain");
  // 'node' should be available on any system running these tests
  const result = manager.findCommand("node");
  assert.ok(result, "node should be found in PATH");
});

test("findCommand returns null for missing command", () => {
  const manager = new LspManager("/tmp/test-brain");
  const result = manager.findCommand("nonexistent-command-xyz-123");
  assert.equal(result, null);
});

test("health returns empty object when no servers running", () => {
  const manager = new LspManager("/tmp/test-brain");
  const result = manager.health();
  assert.deepEqual(result, { servers: {} });
});
