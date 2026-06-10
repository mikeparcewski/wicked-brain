import { execFileSync, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveCodegraph } from "./codegraph-resolver.mjs";

export function dbPath(sourcePath) {
  return join(sourcePath, ".codegraph", "codegraph.db");
}

/**
 * How far the graph has drifted from HEAD. Fail-open: errors report
 * present-but-unknown, never throw.
 * @returns {{present:boolean, stale:boolean|null, commits_behind:number|null, indexed_at:string|null}}
 */
export function staleness(sourcePath) {
  const db = dbPath(sourcePath);
  if (!existsSync(db)) {
    return { present: false, stale: null, commits_behind: null, indexed_at: null };
  }
  try {
    const iso = new Date(statSync(db).mtimeMs).toISOString();
    const out = execFileSync("git",
      ["-C", sourcePath, "rev-list", "--count", `--since=${iso}`, "HEAD"],
      { encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
    const behind = out ? parseInt(out, 10) : 0;
    return { present: true, stale: behind > 0, commits_behind: behind, indexed_at: iso };
  } catch {
    return { present: true, stale: null, commits_behind: null, indexed_at: null };
  }
}

/**
 * Build/refresh the graph by shelling codegraph. `init` bootstraps .codegraph
 * AND indexes; `index` refreshes an existing graph (fails if .codegraph is
 * absent) — so we pick based on db presence (pinned in docs/codegraph-contract.md).
 * Resolves nothing -> {ok:false}. Never throws. `_spawn` is injectable for tests.
 * @returns {Promise<{ok:boolean, subcommand?:string, error?:string}>}
 */
export function runIndex(sourcePath, opts = {}, _spawn = spawn) {
  return new Promise((resolve) => {
    const argv = resolveCodegraph({ ...opts, sourcePath });
    if (!argv) { resolve({ ok: false, error: "codegraph not resolvable" }); return; }
    const [cmd, ...prefix] = argv;
    const sub = existsSync(dbPath(sourcePath)) ? "index" : "init";
    const proc = _spawn(cmd, [...prefix, sub, "."], { cwd: sourcePath, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (e) => resolve({ ok: false, error: e.message }));
    proc.on("close", (code) =>
      resolve(code === 0 ? { ok: true, subcommand: sub }
                         : { ok: false, error: stderr.trim() || `exit ${code}` }));
  });
}
