import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveServer, KNOWN_SERVERS, getKnownExtensions } from "../lib/lsp-servers.mjs";

test("resolveServer returns correct server for .ts extension", () => {
  const server = resolveServer(".ts");
  assert.equal(server.command, "typescript-language-server");
  assert.deepEqual(server.args, ["--stdio"]);
});

test("resolveServer returns correct server for .py extension", () => {
  const server = resolveServer(".py");
  assert.equal(server.command, "pyright-langserver");
});

test("resolveServer returns null for unknown extension", () => {
  const server = resolveServer(".xyz123");
  assert.equal(server, null);
});

test("KNOWN_SERVERS covers at least 40 server entries", () => {
  assert.ok(Object.keys(KNOWN_SERVERS).length >= 40, `Only ${Object.keys(KNOWN_SERVERS).length} servers`);
});

test("resolveServer handles multiple extensions for same server", () => {
  const ts = resolveServer(".ts");
  const tsx = resolveServer(".tsx");
  const js = resolveServer(".js");
  assert.equal(ts.key, "typescript");
  assert.equal(tsx.key, "typescript");
  assert.equal(js.key, "typescript");
});

test("every server has install info", () => {
  for (const [key, server] of Object.entries(KNOWN_SERVERS)) {
    assert.ok(server.install, `${key} missing install info`);
    assert.ok(server.install.method, `${key} missing install method`);
  }
});

test("getKnownExtensions returns a set with common extensions", () => {
  const exts = getKnownExtensions();
  assert.ok(exts.has(".ts"));
  assert.ok(exts.has(".py"));
  assert.ok(exts.has(".rs"));
  assert.ok(exts.has(".go"));
  assert.ok(exts.size >= 50, `Only ${exts.size} extensions`);
});

test("resolveServer prefers user override over built-in", () => {
  const overrides = {
    python: {
      command: "pylsp",
      args: ["--stdio"],
      extensions: [".py"],
      install: { method: "pip", package: "python-lsp-server" }
    }
  };
  const server = resolveServer(".py", overrides);
  assert.equal(server.command, "pylsp");
});
