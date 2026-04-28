#!/usr/bin/env node
// wicked-brain-call — thin CLI wrapper around the wicked-brain HTTP API.
// Auto-starts the server (lock-guarded, detached) when no live process answers
// the configured port, then forwards a single action call and prints the
// JSON response. Skills can drop the "is the server up?" dance and just shell
// out to this binary.

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SERVER_BIN = join(__dirname, "wicked-brain-server.mjs");

// ---------- arg parsing ----------

function parseArgs(argv) {
  const out = { flags: {}, params: {}, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--help":
      case "-h": out.flags.help = true; break;
      case "--version":
      case "-v": out.flags.version = true; break;
      case "--pretty": out.flags.pretty = true; break;
      case "--no-spawn": out.flags.noSpawn = true; break;
      case "--no-audit": out.flags.noAudit = true; break;
      case "--start": out.flags.start = true; break;
      case "--stop": out.flags.stop = true; break;
      case "--status": out.flags.status = true; break;
      case "--brain":
      case "-b": out.flags.brain = argv[++i]; break;
      case "--port":
      case "-p": out.flags.port = parseInt(argv[++i], 10); break;
      case "--source": out.flags.source = argv[++i]; break;
      case "--spawn-timeout": out.flags.spawnTimeoutMs = parseInt(argv[++i], 10); break;
      case "--param": {
        const kv = argv[++i] || "";
        const idx = kv.indexOf("=");
        if (idx === -1) die(`--param requires key=value, got: ${kv}`);
        out.params[kv.slice(0, idx)] = coerce(kv.slice(idx + 1));
        break;
      }
      default:
        if (a.startsWith("--")) die(`Unknown flag: ${a}`);
        out.positional.push(a);
    }
  }
  return out;
}

// Coerce --param values: numbers, booleans, JSON. Plain strings stay strings.
// Skills can pass primitives without quoting; complex shapes go via positional
// JSON or stdin.
function coerce(s) {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if (s.startsWith("{") || s.startsWith("[")) {
    try { return JSON.parse(s); } catch { /* fall through to string */ }
  }
  return s;
}

// ---------- brain path discovery ----------
// Mirrors the resolution skills use: explicit flag → env → per-project →
// legacy flat. Returning the per-project path even when nothing exists yet
// lets `--start` create the directory cleanly.

function resolveBrainPath(explicit) {
  if (explicit) return resolve(explicit);
  if (process.env.WICKED_BRAIN_PATH) return resolve(process.env.WICKED_BRAIN_PATH);
  const cwdBase = basename(process.cwd());
  const perProject = join(homedir(), ".wicked-brain", "projects", cwdBase);
  if (
    existsSync(join(perProject, "_meta", "config.json")) ||
    existsSync(join(perProject, "brain.json"))
  ) {
    return perProject;
  }
  const flat = join(homedir(), ".wicked-brain");
  if (existsSync(join(flat, "_meta", "config.json"))) return flat;
  return perProject;
}

function readMetaConfig(brainPath) {
  try {
    return JSON.parse(readFileSync(join(brainPath, "_meta", "config.json"), "utf-8"));
  } catch {
    return {};
  }
}

// ---------- HTTP ----------

async function callApi(port, action, params, { timeoutMs = 30000, auditFile } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers = { "Content-Type": "application/json" };
  if (auditFile) headers["x-wicked-audit-file"] = auditFile;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, params: params || {} }),
      signal: ctrl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function healthCheck(port, { timeoutMs = 800 } = {}) {
  try {
    const r = await callApi(port, "health", {}, { timeoutMs });
    return !!(r && r.status === "ok");
  } catch {
    return false;
  }
}

// ---------- spawn lock ----------
// Cross-platform exclusive-create lock via { flag: "wx" }. Stale entries
// (older than STALE_LOCK_MS) are reaped on contention so a crashed CLI
// doesn't permanently block future spawns.

const STALE_LOCK_MS = 30_000;

function tryLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, t: Date.now() }),
        { flag: "wx" },
      );
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (attempt === 0) {
        let stale = false;
        try {
          const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
          stale = !lock?.t || Date.now() - lock.t > STALE_LOCK_MS;
        } catch {
          stale = true;
        }
        if (stale) {
          try { unlinkSync(lockPath); } catch {}
          continue;
        }
      }
      return false;
    }
  }
  return false;
}

function releaseLock(lockPath) {
  try { unlinkSync(lockPath); } catch {}
}

function pidAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = exists but we lack permission to signal — still alive.
    return err.code === "EPERM";
  }
}

// ---------- server lifecycle ----------

async function ensureServer(brainPath, opts) {
  const { explicitPort, sourceOverride, noSpawn, log, spawnTimeoutMs = 10_000 } = opts;
  const meta = readMetaConfig(brainPath);
  const port = explicitPort || meta.server_port || 4242;

  if (await healthCheck(port)) return port;
  if (noSpawn) {
    throw new Error(`server not reachable on port ${port} and --no-spawn was set`);
  }

  mkdirSync(join(brainPath, "_meta"), { recursive: true });
  const lockPath = join(brainPath, "_meta", "spawn.lock");

  if (!tryLock(lockPath)) {
    log(`another process is starting the server; waiting...`);
    if (await waitForHealth(port, spawnTimeoutMs)) return port;
    throw new Error(`concurrent spawn timed out on port ${port}`);
  }

  try {
    // Re-check after acquiring the lock — another process might have started
    // and finished while we were contending.
    if (await healthCheck(port)) return port;

    const pidPath = join(brainPath, "_meta", "server.pid");
    if (existsSync(pidPath)) {
      const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
      if (pidAlive(pid)) {
        throw new Error(
          `server PID ${pid} is alive but not answering health on port ${port}. ` +
          `Stop it manually or remove ${pidPath}.`,
        );
      }
      try { unlinkSync(pidPath); } catch {}
    }

    log(`starting wicked-brain-server (brain=${brainPath} port=${port})`);
    const sourcePath = sourceOverride || meta.source_path;
    const argv = [SERVER_BIN, "--brain", brainPath, "--port", String(port)];
    if (sourcePath) argv.push("--source", sourcePath);

    const child = spawn(process.execPath, argv, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    if (await waitForHealth(port, spawnTimeoutMs)) return port;
    throw new Error(`server did not become ready within ${spawnTimeoutMs}ms on port ${port}`);
  } finally {
    releaseLock(lockPath);
  }
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthCheck(port, { timeoutMs: 500 })) return true;
    await sleep(150);
  }
  return false;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------- audit log ----------
// Every action call gets a markdown breadcrumb at
//   {brain}/calls/YYYY-MM-DD/HHMMSS-<action>-<id>.md
// The file is opened with the request body and finalized after the response
// returns (or after a failure) so a partial record still exists if the CLI
// crashes mid-call. Lifecycle commands (--start/--stop/--status) are NOT
// audited — they're operator commands, not data-plane traffic.
//
// Disabled with WICKED_BRAIN_AUDIT=0 or --no-audit.

function isoStamp(d = new Date()) {
  return d.toISOString();
}

function auditPaths(brainPath, action) {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);             // YYYY-MM-DD
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, ""); // HHMMSS
  const id = randomBytes(3).toString("hex");
  const safeAction = String(action || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const dir = join(brainPath, "calls", datePart);
  const file = join(dir, `${timePart}-${safeAction}-${id}.md`);
  return { dir, file, id, ts: now.toISOString() };
}

function fmtFrontmatter(obj) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v === null) { lines.push(`${k}: null`); continue; }
    if (typeof v === "string") { lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`); continue; }
    lines.push(`${k}: ${v}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function fmtJsonBlock(label, value) {
  return `## ${label}\n\n\`\`\`json\n${JSON.stringify(value ?? null, null, 2)}\n\`\`\``;
}

function writeAuditOpen(brainPath, action, params, port) {
  try {
    const a = auditPaths(brainPath, action);
    mkdirSync(a.dir, { recursive: true });
    const front = fmtFrontmatter({
      action,
      call_id: a.id,
      timestamp: a.ts,
      brain_path: brainPath,
      port,
      cwd: process.cwd(),
      pid: process.pid,
      status: "in_progress",
    });
    const body = [
      front,
      "",
      `# wicked-brain-call \`${action}\``,
      "",
      fmtJsonBlock("Request params", params),
      "",
    ].join("\n");
    writeFileSync(a.file, body, "utf-8");
    return a;
  } catch {
    // Audit is best-effort. Never fail the call because we couldn't write a record.
    return null;
  }
}

function writeAuditClose(audit, { exitCode, durationMs, response, error }) {
  if (!audit) return;
  try {
    const head = readFileSync(audit.file, "utf-8");
    const closing = fmtFrontmatter({
      finalized_at: isoStamp(),
      exit_code: exitCode,
      duration_ms: durationMs,
      status: error ? "error" : "ok",
    });
    const responseSection = response !== undefined
      ? fmtJsonBlock("Response", response)
      : "";
    const errorSection = error
      ? `## Error\n\n\`\`\`\n${String(error)}\n\`\`\``
      : "";
    const tail = [closing, "", responseSection, errorSection]
      .filter(Boolean)
      .join("\n\n");
    writeFileSync(audit.file, `${head}\n${tail}\n`, "utf-8");
  } catch {
    // Best-effort.
  }
}

function auditEnabled(flagOff) {
  if (flagOff) return false;
  if (process.env.WICKED_BRAIN_AUDIT === "0") return false;
  return true;
}

// ---------- stdin ----------
// Stdin is only read when the caller writes `-` as the payload positional —
// matches `kubectl apply -f -`. The implicit "no payload? try stdin" pattern
// hangs whenever a parent forgets to close the child's stdin pipe (common in
// supervisors, CI runners, the node spawn() default). Explicit opt-in keeps
// the wrapper safe to drop into any execution context.

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  return buf || null;
}

// ---------- main ----------

function die(msg, code = 2) {
  process.stderr.write(`wicked-brain-call: ${msg}\n`);
  process.exit(code);
}

const HELP = `wicked-brain-call — invoke the wicked-brain server, auto-starting if needed.

Usage:
  wicked-brain-call <action> [json-payload]
  wicked-brain-call <action> --param key=value [--param key2=value2 ...]
  echo '{"query":"foo"}' | wicked-brain-call <action> -

Lifecycle:
  wicked-brain-call --start                start the server (no call)
  wicked-brain-call --stop                 stop the server
  wicked-brain-call --status               print server state

Options:
  --brain <path>          brain directory (default: discover)
  --port <n>              override port from _meta/config.json
  --source <path>         LSP source root passed to spawned server
  --no-spawn              fail if server is not running (don't auto-start)
  --no-audit              skip writing audit markdown (also: WICKED_BRAIN_AUDIT=0)
  --spawn-timeout <ms>    how long to wait for spawn readiness (default 10000)
  --pretty                pretty-print JSON output
  --param key=value       add an individual param (repeatable)
  --version, -v           print version
  --help, -h              print this help

Exit codes:
  0   success
  1   API returned an error field
  2   CLI / infrastructure failure (bad args, can't reach server, etc.)

Examples:
  wicked-brain-call health
  wicked-brain-call search '{"query":"sqlite","topK":5}'
  wicked-brain-call search --param query=sqlite --param topK=5
`;

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.version) {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8"));
    process.stdout.write(pkg.version + "\n");
    process.exit(0);
  }

  if (args.flags.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const noModeFlag = !args.flags.start && !args.flags.stop && !args.flags.status;
  if (noModeFlag && args.positional.length === 0) {
    process.stderr.write(HELP);
    process.exit(1);
  }

  const log = (msg) => process.stderr.write(`[wicked-brain-call] ${msg}\n`);
  const brainPath = resolveBrainPath(args.flags.brain);

  // ---- --status ----
  if (args.flags.status) {
    const meta = readMetaConfig(brainPath);
    const port = args.flags.port || meta.server_port || 4242;
    const running = await healthCheck(port);
    let pid = null;
    try { pid = parseInt(readFileSync(join(brainPath, "_meta", "server.pid"), "utf-8").trim(), 10); } catch {}
    const payload = {
      brain_path: brainPath,
      port,
      running,
      pid: running && pidAlive(pid) ? pid : null,
    };
    process.stdout.write(
      (args.flags.pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload)) + "\n",
    );
    process.exit(0);
  }

  // ---- --stop ----
  if (args.flags.stop) {
    const meta = readMetaConfig(brainPath);
    const port = args.flags.port || meta.server_port || 4242;
    const pidPath = join(brainPath, "_meta", "server.pid");
    let pid = null;
    try { pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10); } catch {}
    if (!pid || !pidAlive(pid)) {
      process.stdout.write(JSON.stringify({ stopped: false, reason: "not running", port }) + "\n");
      process.exit(0);
    }
    try { process.kill(pid, "SIGTERM"); } catch (err) { die(`kill ${pid} failed: ${err.message}`); }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!pidAlive(pid)) break;
      await sleep(100);
    }
    process.stdout.write(JSON.stringify({ stopped: !pidAlive(pid), pid, port }) + "\n");
    process.exit(0);
  }

  // ---- --start ----
  if (args.flags.start) {
    const port = await ensureServer(brainPath, {
      explicitPort: args.flags.port,
      sourceOverride: args.flags.source,
      noSpawn: false,
      spawnTimeoutMs: args.flags.spawnTimeoutMs,
      log,
    }).catch(err => die(err.message));
    process.stdout.write(JSON.stringify({ started: true, port, brain_path: brainPath }) + "\n");
    process.exit(0);
  }

  // ---- default: forward an action call ----
  const action = args.positional[0];
  let params = Object.keys(args.params).length > 0 ? args.params : null;

  if (args.positional.length > 1) {
    const raw = args.positional.slice(1).join(" ");
    if (raw === "-") {
      const piped = await readStdin();
      if (piped) {
        try { params = { ...(params || {}), ...JSON.parse(piped) }; } catch (err) {
          die(`stdin payload is not valid JSON: ${err.message}`);
        }
      }
    } else {
      let parsed;
      try { parsed = JSON.parse(raw); } catch (err) {
        die(`positional payload is not valid JSON: ${err.message}`);
      }
      params = { ...(params || {}), ...parsed };
    }
  }

  const port = await ensureServer(brainPath, {
    explicitPort: args.flags.port,
    sourceOverride: args.flags.source,
    noSpawn: args.flags.noSpawn,
    spawnTimeoutMs: args.flags.spawnTimeoutMs,
    log,
  }).catch(err => die(err.message));

  // Open audit BEFORE the call so a crash mid-flight still leaves a partial
  // record. Audit is best-effort — write failures never block the request.
  const audit = auditEnabled(args.flags.noAudit)
    ? writeAuditOpen(brainPath, action, params, port)
    : null;

  const startedAt = Date.now();
  let response;
  let callError;
  try {
    response = await callApi(port, action, params, { auditFile: audit?.file });
  } catch (err) {
    callError = err;
  }
  const durationMs = Date.now() - startedAt;

  if (callError) {
    writeAuditClose(audit, { exitCode: 2, durationMs, error: callError.message });
    die(`request failed: ${callError.message}`);
  }

  const exitCode = response && response.error ? 1 : 0;
  writeAuditClose(audit, {
    exitCode,
    durationMs,
    response,
    error: response?.error,
  });

  process.stdout.write(
    (args.flags.pretty ? JSON.stringify(response, null, 2) : JSON.stringify(response)) + "\n",
  );
  process.exit(exitCode);
})().catch(err => die(err.message ?? String(err)));
