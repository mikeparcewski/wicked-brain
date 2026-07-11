import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const callBin = join(__dirname, "..", "bin", "wicked-brain-call.mjs");

const port = Math.floor(5100 + Math.random() * 800);
let brainDir;

// Run the CLI and collect stdout/stderr/exit code. We use spawnSync because
// every test command is short-lived and we want a clean exit code per call.
function runCli(args, { input } = {}) {
  const res = spawnSync(
    process.execPath,
    [callBin, "--brain", brainDir, "--port", String(port), "--spawn-timeout", "10000", ...args],
    { encoding: "utf-8", input, timeout: 15_000 },
  );
  return {
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    status: res.status,
    parsed: tryJson(res.stdout || ""),
  };
}

function tryJson(s) {
  try { return JSON.parse(s.trim()); } catch { return null; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Ask the OS for a free port (bind 0, read, release). Random ranges collide
// with real services on CI runners — macOS holds 6000 (X11), etc. — and the
// CLI's explicit --port means bind-or-fail with no upward probing.
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

before(() => {
  brainDir = mkdtempSync(join(tmpdir(), "wb-call-test-"));
  mkdirSync(join(brainDir, "_meta"), { recursive: true });
  writeFileSync(join(brainDir, "brain.json"), JSON.stringify({ id: "test-call" }));
});

after(async () => {
  // Best-effort: kill the server we spawned so the test process exits cleanly.
  try {
    const pid = parseInt(readFileSync(join(brainDir, "_meta", "server.pid"), "utf-8").trim(), 10);
    if (pid) {
      try { process.kill(pid, "SIGTERM"); } catch {}
      // Give it a beat to clean up the pid file.
      await sleep(500);
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  } catch {}
});

test("--no-spawn fails when server isn't running", () => {
  const r = runCli(["--no-spawn", "health"]);
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stderr, /not reachable|no-spawn/);
});

test("cold call auto-spawns the server and returns health", async () => {
  const r = runCli(["health"]);
  assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
  assert.ok(r.parsed, `response was not JSON: ${r.stdout}`);
  assert.equal(r.parsed.status, "ok");
  assert.equal(r.parsed.brain_id, "test-call");
  // PID file should exist now.
  assert.ok(existsSync(join(brainDir, "_meta", "server.pid")), "pid file missing after spawn");
});

test("warm call reuses the running server (no spawn-lock contention)", async () => {
  const before = readFileSync(join(brainDir, "_meta", "server.pid"), "utf-8").trim();
  const r = runCli(["health"]);
  assert.equal(r.status, 0);
  const after = readFileSync(join(brainDir, "_meta", "server.pid"), "utf-8").trim();
  assert.equal(before, after, "pid changed — server was respawned");
  // Warm path should not have written a spawn message to stderr.
  assert.doesNotMatch(r.stderr, /starting wicked-brain-server/);
});

test("--status reports running with pid", () => {
  const r = runCli(["--status"]);
  assert.equal(r.status, 0);
  assert.ok(r.parsed);
  assert.equal(r.parsed.running, true);
  assert.equal(typeof r.parsed.pid, "number");
  assert.equal(r.parsed.port, port);
});

test("--param values merge into the action call", () => {
  // Index a doc via --param, then search and confirm it lands.
  const idx = runCli([
    "index",
    "--param", "id=doc-cli",
    "--param", "path=notes/cli.md",
    "--param", "content=cli wrapper smoke test",
  ]);
  assert.equal(idx.status, 0, `index failed: ${idx.stderr}`);

  const search = runCli(["search", "--param", "query=cli wrapper"]);
  assert.equal(search.status, 0);
  assert.ok(search.parsed?.results?.some(r => r.id === "doc-cli"),
    `doc-cli not in results: ${search.stdout}`);
});

test("positional JSON payload works", () => {
  const r = runCli(["search", '{"query":"smoke"}']);
  assert.equal(r.status, 0);
  assert.ok(r.parsed?.results, "results missing");
});

test("stdin payload works when '-' is the positional", () => {
  const r = runCli(["search", "-"], { input: '{"query":"smoke"}' });
  assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
  assert.ok(r.parsed?.results);
});

test("no payload + no '-' does NOT read stdin (no hang)", () => {
  // Pre-fix bug: implicit stdin read hung whenever stdin was an open pipe.
  // With explicit `-` opt-in, calling an action with no payload should
  // simply send {} to the server and return promptly.
  const r = runCli(["health"], { input: "this should be ignored" });
  assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
  assert.equal(r.parsed?.status, "ok");
});

test("API errors return exit 1 with error in JSON", () => {
  const r = runCli(["totally-bogus-action"]);
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}`);
  assert.ok(r.parsed?.error, `expected error field, got: ${r.stdout}`);
});

test("invalid positional JSON exits 2", () => {
  const r = runCli(["search", "not-json"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not valid JSON/);
});

test("audit log: each call writes a markdown breadcrumb with frontmatter + bodies", () => {
  // Find today's audit dir.
  const today = new Date().toISOString().slice(0, 10);
  const auditDir = join(brainDir, "calls", today);
  assert.ok(existsSync(auditDir), `audit dir missing: ${auditDir}`);
  const files = readdirSync(auditDir).filter(f => f.endsWith(".md"));
  assert.ok(files.length > 0, "no audit files written");
  // The most recent file should belong to a search/index/health call.
  const latest = files.sort().at(-1);
  const body = readFileSync(join(auditDir, latest), "utf-8");
  assert.match(body, /^---/, "missing opening frontmatter");
  assert.match(body, /action: "[^"]+"/, "missing action field");
  assert.match(body, /call_id: "[a-f0-9]+"/, "missing call_id");
  assert.match(body, /port: \d+/, "missing port");
  assert.match(body, /## Request params/, "missing request section");
  assert.match(body, /finalized_at: "[^"]+"/, "missing finalized_at — call wasn't closed");
  assert.match(body, /exit_code: \d+/, "missing exit_code");
  assert.match(body, /## Response/, "missing response section");
});

test("--no-audit suppresses audit writes", () => {
  // Use a fresh subdirectory to avoid counting files from earlier tests.
  const today = new Date().toISOString().slice(0, 10);
  const auditDir = join(brainDir, "calls", today);
  const before = existsSync(auditDir) ? readdirSync(auditDir).length : 0;
  const r = runCli(["--no-audit", "health"]);
  assert.equal(r.status, 0);
  const after = existsSync(auditDir) ? readdirSync(auditDir).length : 0;
  assert.equal(after, before, "audit file written despite --no-audit");
});

test("WICKED_BRAIN_AUDIT=0 also suppresses audits", () => {
  const today = new Date().toISOString().slice(0, 10);
  const auditDir = join(brainDir, "calls", today);
  const before = existsSync(auditDir) ? readdirSync(auditDir).length : 0;
  const res = spawnSync(
    process.execPath,
    [callBin, "--brain", brainDir, "--port", String(port), "health"],
    { encoding: "utf-8", env: { ...process.env, WICKED_BRAIN_AUDIT: "0" }, timeout: 15_000 },
  );
  assert.equal(res.status, 0);
  const after = existsSync(auditDir) ? readdirSync(auditDir).length : 0;
  assert.equal(after, before, "audit file written despite WICKED_BRAIN_AUDIT=0");
});

test("--stop terminates the running server", async () => {
  const r = runCli(["--stop"]);
  assert.equal(r.status, 0);
  assert.ok(r.parsed?.stopped, `expected stopped:true, got ${r.stdout}`);
  // Status should now report not running.
  await sleep(200);
  const status = runCli(["--status"]);
  assert.equal(status.parsed.running, false);
});

test("concurrent cold starts converge on a single server (lock works)", async () => {
  // Brand-new brain dir for this test so we know nothing is running.
  const dir = mkdtempSync(join(tmpdir(), "wb-call-race-"));
  mkdirSync(join(dir, "_meta"), { recursive: true });
  writeFileSync(join(dir, "brain.json"), JSON.stringify({ id: "race" }));
  const racePort = Math.floor(5900 + Math.random() * 100);

  const launch = () => new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [callBin, "--brain", dir, "--port", String(racePort), "--spawn-timeout", "10000", "health"],
      { encoding: "utf-8" },
    );
    let stdout = "", stderr = "";
    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr += d; });
    child.on("exit", code => resolve({ code, stdout, stderr }));
  });

  const results = await Promise.all([launch(), launch(), launch()]);
  try {
    for (const r of results) {
      assert.equal(r.code, 0, `cold call failed: code=${r.code} stderr=${r.stderr}`);
      const parsed = tryJson(r.stdout);
      assert.equal(parsed?.status, "ok");
    }
    // Only one PID file should exist, and only one process should answer.
    const pid = parseInt(readFileSync(join(dir, "_meta", "server.pid"), "utf-8").trim(), 10);
    assert.ok(pid > 0);
  } finally {
    try {
      const pid = parseInt(readFileSync(join(dir, "_meta", "server.pid"), "utf-8").trim(), 10);
      if (pid) { try { process.kill(pid, "SIGKILL"); } catch {} }
    } catch {}
  }
});

// Stand up a fake brain server that answers the health action with a chosen
// brain_id — same response shape as the real server (db.health()). Lets us
// simulate "a DIFFERENT brain occupies this port" without spawning two real
// servers or touching live brain data.
//
// Non-health actions are RECORDED (so a test can prove whether a data op was
// actually routed to this server) and answered with a benign ok payload. This
// is the canary for the data-path guard: if the brain_id reconciliation works,
// a mismatched op must be refused BEFORE it reaches here, so `received` stays
// empty for the mutating action.
function startFakeBrainServer(brainId) {
  return new Promise((resolve) => {
    const received = [];
    const srv = createHttpServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        let parsed = {};
        try { parsed = JSON.parse(body || "{}"); } catch {}
        const action = parsed.action || "";
        res.setHeader("Content-Type", "application/json");
        if (action === "health") {
          res.end(JSON.stringify({ status: "ok", uptime: 1, brain_id: brainId }));
        } else {
          received.push(parsed);
          // Echo a benign success so a CORRECTLY-routed op looks like it landed.
          res.end(JSON.stringify({ ok: true, fake_brain_id: brainId, action }));
        }
      });
    });
    srv.listen(0, "127.0.0.1", () =>
      resolve({ srv, port: srv.address().port, received }),
    );
  });
}

// Run the CLI WITHOUT blocking the test's event loop. The fake brain server
// lives in THIS process, so a synchronous spawnSync would freeze the event
// loop and the fake server could never answer the child's health probe (it
// would see zero requests). Async spawn keeps the loop live to serve them.
function runCliAsync(args, { cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [callBin, ...args], { encoding: "utf-8", cwd });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("exit", (code) => resolve({ stdout, stderr, status: code, parsed: tryJson(stdout) }));
  });
}

test("--status reports port_conflict when a DIFFERENT brain occupies the port", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-mismatch-status-"));
  mkdirSync(join(dir, "_meta"), { recursive: true });
  // We expect to be brain "alpha"...
  writeFileSync(join(dir, "brain.json"), JSON.stringify({ id: "alpha" }));
  // ...but the port is actually held by brain "beta".
  const { srv, port: occupiedPort } = await startFakeBrainServer("beta");
  // A stale PID file for OUR brain — the bug is reporting running:true off this.
  writeFileSync(join(dir, "_meta", "server.pid"), String(process.pid));
  try {
    const r = await runCliAsync(["--brain", dir, "--port", String(occupiedPort), "--status"]);
    assert.ok(r.parsed, `status not JSON: ${r.stdout} ${r.stderr}`);
    assert.equal(r.parsed.running, false, "must NOT report running for a mismatched brain");
    assert.equal(r.parsed.port_conflict, true, "expected port_conflict flag");
    assert.equal(r.parsed.brain_id, "alpha", "should report the EXPECTED brain id");
    assert.equal(r.parsed.actual_brain_id, "beta", "should surface the ACTUAL occupant");
    assert.equal(r.parsed.pid, null, "pid must be null on conflict");
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("--status reports running:true when the SAME brain occupies the port", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-match-status-"));
  mkdirSync(join(dir, "_meta"), { recursive: true });
  writeFileSync(join(dir, "brain.json"), JSON.stringify({ id: "gamma" }));
  const { srv, port: occupiedPort } = await startFakeBrainServer("gamma");
  try {
    const r = await runCliAsync(["--brain", dir, "--port", String(occupiedPort), "--status"]);
    assert.ok(r.parsed, `status not JSON: ${r.stdout} ${r.stderr}`);
    assert.equal(r.parsed.running, true, "matching brain should report running");
    assert.notEqual(r.parsed.port_conflict, true, "no conflict for matching brain");
    assert.equal(r.parsed.brain_id, "gamma");
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("--stop REFUSES when a DIFFERENT brain occupies the port", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-mismatch-stop-"));
  mkdirSync(join(dir, "_meta"), { recursive: true });
  writeFileSync(join(dir, "brain.json"), JSON.stringify({ id: "alpha" }));
  // Stale PID for our brain pointing at THIS test process — proves stop does
  // NOT signal it (the refuse path returns before ever reaching kill()).
  writeFileSync(join(dir, "_meta", "server.pid"), String(process.pid));
  const { srv, port: occupiedPort } = await startFakeBrainServer("beta");
  try {
    const r = await runCliAsync(["--brain", dir, "--port", String(occupiedPort), "--stop"]);
    assert.ok(r.parsed, `stop not JSON: ${r.stdout} ${r.stderr}`);
    assert.equal(r.parsed.stopped, false, "must refuse to stop a mismatched brain");
    assert.equal(r.parsed.reason, "port_conflict");
    assert.equal(r.parsed.brain_id, "alpha");
    assert.equal(r.parsed.actual_brain_id, "beta");
    assert.equal(r.status, 1, `expected refusal exit 1, got ${r.status}`);
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

// ---- data-path brain_id guard (P0: route by port alone was destructive) ----
// The data plane (search/index/remove/forget/query/...) resolves the server via
// ensureServer and then POSTs the action. Before the guard, ensureServer
// confirmed only that SOMETHING healthy answered the persisted port — not that
// it was the EXPECTED brain. A recycled/shared port could route a destructive
// op (remove/forget) to the WRONG brain. These tests pin the fail-closed guard.

test("data path: mutating op (remove) REFUSES with port_conflict on a mismatched brain", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-mismatch-remove-"));
  mkdirSync(join(dir, "_meta"), { recursive: true });
  // We are brain "alpha"...
  writeFileSync(join(dir, "brain.json"), JSON.stringify({ id: "alpha" }));
  // ...but port is held by brain "beta". A remove here would nuke beta's doc.
  const { srv, port: occupiedPort, received } = await startFakeBrainServer("beta");
  try {
    const r = await runCliAsync([
      "--brain", dir,
      "--port", String(occupiedPort),
      "--no-spawn", // make sure we test the WARM-path guard, not a spawn
      "remove",
      "--param", "id=victim-doc",
    ]);
    assert.ok(r.parsed, `remove not JSON: ${r.stdout} ${r.stderr}`);
    assert.equal(r.parsed.refused, true, "mutating op must be refused on mismatch");
    assert.equal(r.parsed.reason, "port_conflict");
    assert.equal(r.parsed.brain_id, "alpha", "should report the EXPECTED brain id");
    assert.equal(r.parsed.actual_brain_id, "beta", "should surface the ACTUAL occupant");
    assert.equal(r.status, 1, `expected refusal exit 1, got ${r.status}`);
    // The destructive call must NOT have reached the foreign server.
    const sawRemove = received.some((m) => m.action === "remove");
    assert.equal(sawRemove, false, "remove leaked to the wrong brain — guard failed");
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("data path: mutating op (index) REFUSES with port_conflict on a mismatched brain", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-mismatch-index-"));
  mkdirSync(join(dir, "_meta"), { recursive: true });
  writeFileSync(join(dir, "brain.json"), JSON.stringify({ id: "alpha" }));
  const { srv, port: occupiedPort, received } = await startFakeBrainServer("beta");
  try {
    const r = await runCliAsync([
      "--brain", dir,
      "--port", String(occupiedPort),
      "--no-spawn",
      "index",
      "--param", "id=x",
      "--param", "path=x.md",
      "--param", "content=should not land on beta",
    ]);
    assert.ok(r.parsed, `index not JSON: ${r.stdout} ${r.stderr}`);
    assert.equal(r.parsed.refused, true, "index must be refused on mismatch");
    assert.equal(r.parsed.reason, "port_conflict");
    assert.equal(r.status, 1);
    const sawIndex = received.some((m) => m.action === "index");
    assert.equal(sawIndex, false, "index leaked to the wrong brain — guard failed");
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("data path: read op (search) also refuses on a mismatched brain (fail closed)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-mismatch-search-"));
  mkdirSync(join(dir, "_meta"), { recursive: true });
  writeFileSync(join(dir, "brain.json"), JSON.stringify({ id: "alpha" }));
  const { srv, port: occupiedPort, received } = await startFakeBrainServer("beta");
  try {
    const r = await runCliAsync([
      "--brain", dir,
      "--port", String(occupiedPort),
      "--no-spawn",
      "search",
      "--param", "query=anything",
    ]);
    assert.ok(r.parsed, `search not JSON: ${r.stdout} ${r.stderr}`);
    assert.equal(r.parsed.reason, "port_conflict", "reads fail closed on mismatch");
    assert.equal(r.status, 1);
    const sawSearch = received.some((m) => m.action === "search");
    assert.equal(sawSearch, false, "search leaked to the wrong brain — guard failed");
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("data path: matching brain_id lets the op THROUGH to the server", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-match-data-"));
  mkdirSync(join(dir, "_meta"), { recursive: true });
  // We are brain "gamma" and the port is held by brain "gamma" — same brain.
  writeFileSync(join(dir, "brain.json"), JSON.stringify({ id: "gamma" }));
  const { srv, port: occupiedPort, received } = await startFakeBrainServer("gamma");
  try {
    const r = await runCliAsync([
      "--brain", dir,
      "--port", String(occupiedPort),
      "--no-spawn",
      "remove",
      "--param", "id=ok-to-remove",
    ]);
    assert.ok(r.parsed, `remove not JSON: ${r.stdout} ${r.stderr}`);
    assert.notEqual(r.parsed.reason, "port_conflict", "matching brain must NOT conflict");
    assert.notEqual(r.parsed.refused, true, "matching brain must not be refused");
    assert.equal(r.status, 0, `expected success exit 0, got ${r.status}; ${r.stderr}`);
    // The op DID reach the (matching) server.
    const sawRemove = received.some((m) => m.action === "remove");
    assert.equal(sawRemove, true, "matching-brain op should have been routed to the server");
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("cold spawn derives --source from cwd when basename matches, and persists source_path", async () => {
  // Per-project brains are keyed on basename(cwd) — when the brain dir name
  // matches the cwd name and config has no source_path, the CLI passes cwd
  // as --source and the server writes it back to _meta/config.json. External
  // port resolution (wicked-garden hooks) matches configs by source_path.
  const srcDir = mkdtempSync(join(tmpdir(), "wb-proj-"));
  const brainRoot = mkdtempSync(join(tmpdir(), "wb-brainroot-"));
  const bDir = join(brainRoot, basename(srcDir));
  mkdirSync(join(bDir, "_meta"), { recursive: true });
  writeFileSync(join(bDir, "brain.json"), JSON.stringify({ id: "test-src-derive" }));

  const srcPort = await freePort();
  const res = spawnSync(
    process.execPath,
    [callBin, "--brain", bDir, "--port", String(srcPort), "--spawn-timeout", "10000", "health"],
    { encoding: "utf-8", cwd: srcDir, timeout: 15_000 },
  );
  try {
    assert.equal(res.status, 0, `exit ${res.status}; stderr: ${res.stderr}`);
    const cfg = JSON.parse(readFileSync(join(bDir, "_meta", "config.json"), "utf-8"));
    assert.ok(cfg.source_path, "source_path missing from _meta/config.json after spawn");
    assert.equal(basename(cfg.source_path), basename(srcDir));
  } finally {
    try {
      const pid = parseInt(readFileSync(join(bDir, "_meta", "server.pid"), "utf-8").trim(), 10);
      if (pid) { try { process.kill(pid, "SIGKILL"); } catch {} }
    } catch {}
  }
});
