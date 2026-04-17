import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const serverBin = join(__dirname, "..", "bin", "wicked-brain-server.mjs");

const port = Math.floor(4200 + Math.random() * 800);
let serverProcess;
let brainDir;

async function api(port, action, params = {}) {
  const res = await fetch(`http://localhost:${port}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, params }),
  });
  return res.json();
}

before(async () => {
  // Create a temp brain directory
  brainDir = mkdtempSync(join(tmpdir(), "fs-brain-test-"));
  mkdirSync(join(brainDir, "_meta"), { recursive: true });
  writeFileSync(
    join(brainDir, "brain.json"),
    JSON.stringify({ id: "test-brain-server" })
  );

  // Spawn the server
  serverProcess = spawn(process.execPath, [serverBin, "--brain", brainDir, "--port", String(port)], {
    stdio: "pipe",
  });

  // Capture stderr so a crashed spawn surfaces its error on test failure
  // instead of looking like a generic ECONNREFUSED. Printed on process exit.
  let stderrBuf = "";
  serverProcess.stderr.on("data", (d) => { stderrBuf += d.toString(); });
  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0 && stderrBuf) {
      process.stderr.write(`[server.test] spawned server exited ${code}:\n${stderrBuf}\n`);
    }
  });

  // Wait ~1.5s for server to start
  await new Promise((resolve) => setTimeout(resolve, 1500));
});

after(() => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
  }
});

test("health check returns ok with brain_id", async () => {
  const result = await api(port, "health");
  assert.equal(result.status, "ok");
  assert.equal(result.brain_id, "test-brain-server");
  assert.ok(typeof result.uptime === "number");
});

test("indexes and searches a document", async () => {
  await api(port, "index", {
    id: "doc1",
    path: "notes/hello.md",
    content: "Hello world this is a test document",
  });

  const result = await api(port, "search", { query: "hello" });
  assert.ok(result.results.length >= 1);
  const found = result.results.find((r) => r.id === "doc1");
  assert.ok(found, "doc1 should appear in search results");
});

test("returns backlinks after indexing a doc with [[link]]", async () => {
  await api(port, "index", {
    id: "doc2",
    path: "notes/linker.md",
    content: "This links to [[target-note]] in the brain",
  });

  const result = await api(port, "backlinks", { id: "target-note" });
  assert.ok(Array.isArray(result.links));
  assert.ok(result.links.length >= 1);
  const link = result.links.find((l) => l.source_id === "doc2");
  assert.ok(link, "doc2 should appear as a backlink source");
});

test("returns forward links", async () => {
  await api(port, "index", {
    id: "doc3",
    path: "notes/forward.md",
    content: "Links to [[page-a]] and [[page-b]]",
  });

  const result = await api(port, "forward_links", { id: "doc3" });
  assert.ok(Array.isArray(result.links));
  assert.ok(result.links.includes("page-a"), "should include page-a");
  assert.ok(result.links.includes("page-b"), "should include page-b");
});

test("returns stats", async () => {
  const result = await api(port, "stats");
  assert.ok(typeof result.total === "number");
  assert.ok(result.total >= 1, "at least one doc indexed");
  assert.ok(typeof result.chunks === "number");
  assert.ok(typeof result.wiki === "number");
});

test("removes a document", async () => {
  await api(port, "index", {
    id: "doc-to-remove",
    path: "notes/remove-me.md",
    content: "This document will be removed soon",
  });

  // Verify it's indexed
  const before = await api(port, "search", { query: "removed soon" });
  const found = before.results.find((r) => r.id === "doc-to-remove");
  assert.ok(found, "doc-to-remove should be indexed");

  // Remove it
  await api(port, "remove", { id: "doc-to-remove" });

  // Verify it's gone
  const afterResult = await api(port, "search", { query: "removed soon" });
  const stillFound = afterResult.results.find((r) => r.id === "doc-to-remove");
  assert.equal(stillFound, undefined, "doc-to-remove should be gone after removal");
});

test("returns error for unknown action", async () => {
  const result = await api(port, "nonexistent_action");
  assert.ok(result.error, "should return an error");
  assert.ok(result.error.includes("nonexistent_action"), "error should mention the action name");
});

test("symbols falls back to FTS when LSP errors (no tsconfig)", async () => {
  // Index a chunk with source_path frontmatter — no TS project present in brain dir
  await api(port, "index", {
    id: "chunks/extracted/MyService/chunk-001.md",
    path: "chunks/extracted/MyService/chunk-001.md",
    content: "---\nsource: MyService.ts\nsource_path: /src/MyService.ts\nsource_type: ts\n---\n\nclass MyService { getValue() {} }",
  });

  const result = await api(port, "symbols", { name: "MyService", limit: 5 });
  // Should not return an error — must fall back to FTS
  assert.ok(!result.error, `symbols should not return an error: ${result.error}`);
  assert.ok(Array.isArray(result.results), "should return a results array");
  assert.equal(result.source, "fts", "source should be fts when LSP is unavailable");
  assert.ok(result.results.length >= 1, "should find at least one FTS result");
  assert.equal(result.results[0].file_path, "/src/MyService.ts");
});

test("GET / serves the viewer HTML", async () => {
  const res = await fetch(`http://localhost:${port}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  const body = await res.text();
  assert.ok(body.startsWith("<!doctype html>"));
  assert.ok(body.includes("test-brain-server"), "brain id should appear in the page");
  assert.ok(body.includes("search-input"));
});

test("GET /api returns 404 (only POST is allowed)", async () => {
  const res = await fetch(`http://localhost:${port}/api`);
  assert.equal(res.status, 404);
});

test("get_document action: by id round-trips", async () => {
  await api(port, "index", {
    id: "viewer-doc-1",
    path: "wiki/viewer-demo.md",
    content: "---\ncanonical_for: [VIEWER-DEMO]\n---\n\n# Hello\n\nViewer body.",
  });
  const { document: doc } = await api(port, "get_document", { id: "viewer-doc-1" });
  assert.equal(doc.id, "viewer-doc-1");
  assert.equal(doc.path, "wiki/viewer-demo.md");
  assert.ok(doc.content.includes("Viewer body"));
  assert.deepEqual(doc.canonical_for, ["VIEWER-DEMO"]);
});

test("get_document action: by path round-trips", async () => {
  const { document: doc } = await api(port, "get_document", { path: "wiki/viewer-demo.md" });
  assert.equal(doc.id, "viewer-doc-1");
});

test("get_document action: returns null document for missing id", async () => {
  const resp = await api(port, "get_document", { id: "definitely-missing" });
  assert.equal(resp.document, null);
});

test("health action reports read_only flag", async () => {
  const h = await api(port, "health");
  assert.equal(h.read_only, false, "default server is not read-only");
});

test("purge_brain action requires DELETE confirmation", async () => {
  // Seed two bodies via index first — one in chunks, one in wiki.
  await api(port, "index", { id: "purge-c", path: "chunks/purge.md", content: "chunk body" });
  await api(port, "index", { id: "purge-w", path: "wiki/purge.md", content: "wiki body" });

  const missing = await api(port, "purge_brain", {});
  assert.match(missing.error, /confirmation missing/);

  const noop = await api(port, "purge_brain", { confirm: "yes" });
  assert.match(noop.error, /confirmation missing/);

  const ok = await api(port, "purge_brain", { confirm: "DELETE" });
  assert.ok(!ok.error, `unexpected error: ${ok.error}`);
  assert.ok(ok.removed, "returns a removed summary");
});

test("reonboard action indexes content files from disk", async () => {
  // Place a wiki file directly on disk under the brain root, then reonboard.
  // The action should pick it up via walkBrainContent + reindex.
  const fs = await import("node:fs");
  const wikiDir = `${brainDir}/wiki`;
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.writeFileSync(`${wikiDir}/hello.md`, "# From disk\\n\\nreonboard content");
  const r = await api(port, "reonboard", {});
  assert.ok(r.indexed >= 1, `expected at least one indexed doc, got ${r.indexed}`);
});

test("--read-only flag blocks write + destructive actions (separate server)", async () => {
  // Spin up a second server on a different port with --read-only. Verifies
  // the gate is wired at the API dispatch layer, not just the UI.
  const { spawn } = await import("node:child_process");
  const { mkdtempSync, mkdirSync: mk, writeFileSync: wf } = await import("node:fs");
  const { join: j } = await import("node:path");
  const { tmpdir: td } = await import("node:os");
  const roDir = mkdtempSync(j(td(), "ro-brain-"));
  mk(j(roDir, "_meta"), { recursive: true });
  wf(j(roDir, "brain.json"), JSON.stringify({ id: "ro-brain" }));
  const roPort = port + 1;
  const proc = spawn(process.execPath, [serverBin, "--brain", roDir, "--port", String(roPort), "--read-only"], { stdio: "pipe" });
  try {
    await new Promise((r) => setTimeout(r, 1200));
    const h = await api(roPort, "health");
    assert.equal(h.read_only, true);

    const blocked = await api(roPort, "purge_brain", { confirm: "DELETE" });
    assert.match(blocked.error || "", /read-only mode/);

    const indexBlocked = await api(roPort, "index", { id: "x", path: "x.md", content: "y" });
    assert.match(indexBlocked.error || "", /read-only mode/);

    // Reads still work.
    const searchable = await api(roPort, "search", { query: "anything" });
    assert.ok("results" in searchable);
  } finally {
    proc.kill("SIGTERM");
  }
});
