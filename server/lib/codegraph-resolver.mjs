import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

const PACKAGE = "@colbymchenry/codegraph";

function argvFor(target) {
  // A .mjs/.js path is a script -> invoke via node; else run directly.
  return /\.(mjs|js)$/.test(target) ? ["node", target] : [target];
}

function whichDefault(command) {
  try {
    const cmd = platform() === "win32" ? "where" : "which";
    const out = execFileSync(cmd, [command], { encoding: "utf-8", timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"] });
    return out.trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

function configBin(brainPath) {
  if (!brainPath) return null;
  try {
    const cfg = JSON.parse(readFileSync(join(brainPath, "_meta", "codegraph.json"), "utf-8"));
    return typeof cfg.bin === "string" && cfg.bin.trim() ? cfg.bin.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the argv prefix that invokes codegraph, or null.
 * Ladder: WICKED_CODEGRAPH_BIN (set-but-empty = kill switch) -> brain
 * _meta/codegraph.json {bin} -> PATH -> source node_modules/.bin -> `npx`.
 */
export function resolveCodegraph(opts = {}) {
  const { env = process.env, brainPath, sourcePath, which = whichDefault,
    allowNpx = true } = opts;

  if (Object.prototype.hasOwnProperty.call(env, "WICKED_CODEGRAPH_BIN")) {
    const v = (env.WICKED_CODEGRAPH_BIN || "").trim();
    return v ? argvFor(v) : null; // empty == kill switch
  }
  const cfg = configBin(brainPath);
  if (cfg) return argvFor(cfg);

  const onPath = which("codegraph");
  if (onPath) return [onPath];

  if (sourcePath) {
    const local = join(sourcePath, "node_modules", ".bin", "codegraph");
    if (existsSync(local)) return [local];
  }
  if (allowNpx && which("npx")) return ["npx", "-y", PACKAGE];
  return null;
}

/** True iff a CONCRETE install resolves (not the npx last resort). */
export function codegraphAvailable(opts = {}) {
  return resolveCodegraph({ ...opts, allowNpx: false }) !== null;
}
