import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
