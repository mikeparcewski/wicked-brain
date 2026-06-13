import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const serverBin = join(__dirname, "..", "bin", "wicked-brain-server.mjs");

// Assigned in before() from an OS-allocated ephemeral port. Was previously a
// fixed random port (Math.floor(4200 + random*800)) chosen at module load —
// node --test runs test FILES in parallel by default, so two files (or two CI
// shards) could land on the same number, and the server runs with an explicit
// --port (bind-or-fail, no upward probe). The loser crashed on EADDRINUSE and
// every test in this file then flaked as ECONNREFUSED. We now ask the OS for a
// free port immediately before spawn and retry the spawn if the port was
// snatched in the (small) gap between release and bind — fixing the race
// rather than masking it with longer sleeps or retried assertions.
let port;
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

// Ask the OS for a free port: bind 0, read the assigned port, release. The
// window between release and the server's bind is small; the spawn loop below
// retries with a fresh port if it loses that race.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port: p } = srv.address();
      srv.close(() => resolve(p));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Poll the health endpoint until it answers (server is up) or the deadline
// passes. Replaces the unconditional 1.5s sleep, which both under-waited on a
// slow CI box and over-waited locally.
async function waitForHealthy(p, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${p}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health", params: {} }),
      });
      const body = await res.json();
      if (body && body.status === "ok") return true;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  return false;
}

// Spawn the server on an ephemeral port, retrying with a fresh port if the
// process dies before answering health (the EADDRINUSE race). Returns the
// live process + the port it bound.
async function spawnServer(brainDir, { extraArgs = [] } = {}) {
  const MAX_ATTEMPTS = 5;
  let lastErr = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const p = await freePort();
    const proc = spawn(
      process.execPath,
      [serverBin, "--brain", brainDir, "--port", String(p), ...extraArgs],
      { stdio: "pipe" },
    );
    let stderrBuf = "";
    let exited = false;
    let exitCode = null;
    proc.stderr.on("data", (d) => { stderrBuf += d.toString(); });
    proc.on("exit", (code) => { exited = true; exitCode = code; });

    if (await waitForHealthy(p)) {
      // Keep surfacing late crashes for diagnostics.
      proc.on("exit", (code) => {
        if (code !== null && code !== 0 && stderrBuf) {
          process.stderr.write(`[server.test] spawned server exited ${code}:\n${stderrBuf}\n`);
        }
      });
      return { proc, port: p };
    }

    // Didn't become healthy. If it died on a port collision, retry on a new
    // port; otherwise surface the failure.
    try { proc.kill("SIGKILL"); } catch {}
    lastErr = stderrBuf;
    if (exited && /EADDRINUSE/.test(stderrBuf)) {
      continue; // race lost — try a fresh ephemeral port
    }
    // Non-collision failure (or never exited but never healthy) — don't spin.
    throw new Error(
      `server did not become healthy on port ${p} (attempt ${attempt + 1}, exitCode=${exitCode}):\n${stderrBuf}`,
    );
  }
  throw new Error(`server never bound a free port after ${MAX_ATTEMPTS} attempts:\n${lastErr}`);
}

before(async () => {
  // Create a temp brain directory
  brainDir = mkdtempSync(join(tmpdir(), "fs-brain-test-"));
  mkdirSync(join(brainDir, "_meta"), { recursive: true });
  writeFileSync(
    join(brainDir, "brain.json"),
    JSON.stringify({ id: "test-brain-server" })
  );

  const started = await spawnServer(brainDir);
  serverProcess = started.proc;
  port = started.port;
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
  // Spin up a second server on its OWN ephemeral port with --read-only.
  // Verifies the gate is wired at the API dispatch layer, not just the UI.
  // Previously this used `port + 1`, which (a) could collide with another
  // listener and (b) tied its fate to the first server's port — the same
  // bind-or-fail flake. Use the robust spawn helper instead.
  const { mkdtempSync, mkdirSync: mk, writeFileSync: wf } = await import("node:fs");
  const { join: j } = await import("node:path");
  const { tmpdir: td } = await import("node:os");
  const roDir = mkdtempSync(j(td(), "ro-brain-"));
  mk(j(roDir, "_meta"), { recursive: true });
  wf(j(roDir, "brain.json"), JSON.stringify({ id: "ro-brain" }));
  const { proc, port: roPort } = await spawnServer(roDir, { extraArgs: ["--read-only"] });
  try {
    const h = await api(roPort, "health");
    assert.equal(h.read_only, true);

    const blocked = await api(roPort, "purge_brain", { confirm: "DELETE" });
    assert.match(blocked.error || "", /read-only mode/);

    const indexBlocked = await api(roPort, "index", { id: "x", path: "x.md", content: "y" });
    assert.match(indexBlocked.error || "", /read-only mode/);

    // Reads still work.
    const searchable = await api(roPort, "search", { query: "anything" });
    assert.ok("results" in searchable);

    // dlq_list is read-only (just lists rows) — should NOT be blocked.
    const dlqOk = await api(roPort, "dlq_list");
    assert.ok(Array.isArray(dlqOk.dead_letters), "dlq_list should work in read-only mode");

    // dlq_replay and dlq_drop mutate the bus DB — must be blocked.
    const replayBlocked = await api(roPort, "dlq_replay", { dl_id: "y" });
    assert.match(replayBlocked.error || "", /read-only mode/);

    const dropBlocked = await api(roPort, "dlq_drop", { dl_id: "y" });
    assert.match(dropBlocked.error || "", /read-only mode/);
  } finally {
    proc.kill("SIGTERM");
  }
});

test("dlq_list returns an array (empty when bus has no dead letters or is unavailable)", async () => {
  const result = await api(port, "dlq_list");
  assert.ok(Array.isArray(result.dead_letters), "dead_letters should be an array");
});

test("dlq_list accepts limit and cursor_id params without crashing", async () => {
  const result = await api(port, "dlq_list", { limit: 25, cursor_id: "no-such-cursor" });
  assert.ok(Array.isArray(result.dead_letters));
});

test("dlq_replay rejects missing dl_id", async () => {
  const noArgs = await api(port, "dlq_replay");
  assert.equal(noArgs.ok, false);
  assert.match(noArgs.error || "", /dl_id required|unavailable/);
});

test("dlq_drop rejects missing dl_id", async () => {
  const noArgs = await api(port, "dlq_drop");
  assert.equal(noArgs.ok, false);
  assert.match(noArgs.error || "", /dl_id required|unavailable/);
});

test("dlq_list parses string limit defensively (CLI/HTTP layer often passes strings)", async () => {
  const result = await api(port, "dlq_list", { limit: "25" });
  assert.ok(Array.isArray(result.dead_letters));
});

test("confirm_link with verdict=contradict does not crash and returns ok", async () => {
  // No matching link exists; confirmLink returns null. The HTTP layer maps
  // null to { ok: true }. The handler still fires both wicked.link.confirmed
  // and (because verdict=contradict) wicked.link.contradicted — we can't
  // observe the emit from here, but we verify the dispatch path is wired.
  const result = await api(port, "confirm_link", {
    source_id: "no-such-source",
    target_path: "no-such-target",
    verdict: "contradict",
  });
  assert.equal(result.ok, true, "no-op contradict against missing link should not error");
  assert.equal(result.error, undefined, "should not surface a handler error");
});
