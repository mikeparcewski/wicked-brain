import { test } from "node:test";
import assert from "node:assert/strict";
import { LspClient } from "../lib/lsp-client.mjs";

test("health returns empty servers when none running", () => {
  const client = new LspClient("/tmp/test-brain", null);
  const result = client.health();
  assert.deepEqual(result, { servers: {} });
});

test("diagnostics returns empty when no servers running", () => {
  const client = new LspClient("/tmp/test-brain", null);
  const result = client.diagnostics();
  assert.deepEqual(result, { diagnostics: {}, errors: 0, warnings: 0, info: 0 });
});

test("diagnostics with file returns empty when no data", () => {
  const client = new LspClient("/tmp/test-brain", null);
  const result = client.diagnostics({ file: "/tmp/test.js" });
  assert.deepEqual(result, { diagnostics: [], errors: 0, warnings: 0, info: 0 });
});

test("handleFileChange does nothing for unknown extensions", () => {
  const client = new LspClient("/tmp/test-brain", null);
  // Should not throw
  client.handleFileChange("test.xyz", "/tmp/test.xyz", "content", "change");
});
