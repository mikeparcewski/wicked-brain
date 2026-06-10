import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { dbPath, staleness, runIndex } from "../lib/codegraph-index.mjs";

test("dbPath points at <source>/.codegraph/codegraph.db", () => {
  assert.equal(dbPath("/repo"), join("/repo", ".codegraph", "codegraph.db"));
});

test("staleness reports not-present when db is missing", () => {
  const s = staleness("/no/such/repo");
  assert.equal(s.present, false);
  assert.equal(s.stale, null);
});

test("staleness reports commits behind HEAD", () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-stale-"));
  try {
    const git = (...a) => execFileSync("git", ["-C", repo, ...a], { stdio: "pipe" });
    git("init", "-b", "main"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
    writeFileSync(join(repo, "f.txt"), "1"); git("add", "-A"); git("commit", "-m", "c1");
    mkdirSync(join(repo, ".codegraph"), { recursive: true });
    const db = join(repo, ".codegraph", "codegraph.db");
    writeFileSync(db, "x");
    const past = new Date(Date.now() - 60_000);
    utimesSync(db, past, past);          // backdate the db before a 2nd commit
    writeFileSync(join(repo, "g.txt"), "2"); git("add", "-A"); git("commit", "-m", "c2");
    const s = staleness(repo);
    assert.equal(s.present, true);
    assert.equal(s.stale, true);
    assert.ok(s.commits_behind >= 1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// runIndex chooses init vs index based on whether the graph db already exists.
// Inject a fake spawn so we assert the subcommand WITHOUT invoking real codegraph.
function fakeSpawn(captured) {
  return (cmd, args, opts) => {
    captured.cmd = cmd; captured.args = args; captured.opts = opts;
    const p = new EventEmitter();
    p.stderr = new EventEmitter();
    queueMicrotask(() => p.emit("close", 0));
    return p;
  };
}

test("runIndex uses `init` when no graph exists yet", async () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-init-"));
  try {
    const cap = {};
    const r = await runIndex(repo, { env: { WICKED_CODEGRAPH_BIN: "codegraph" } }, fakeSpawn(cap));
    assert.equal(r.ok, true);
    assert.equal(cap.args[0], "init");
    assert.equal(cap.opts.cwd, repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runIndex uses `index` when a graph already exists", async () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-idx-"));
  try {
    mkdirSync(join(repo, ".codegraph"), { recursive: true });
    writeFileSync(join(repo, ".codegraph", "codegraph.db"), "x");
    const cap = {};
    const r = await runIndex(repo, { env: { WICKED_CODEGRAPH_BIN: "codegraph" } }, fakeSpawn(cap));
    assert.equal(r.ok, true);
    assert.equal(cap.args[0], "index");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runIndex returns ok:false when codegraph is unresolvable", async () => {
  const r = await runIndex("/tmp", { env: { WICKED_CODEGRAPH_BIN: "" } });  // kill switch
  assert.equal(r.ok, false);
  assert.match(r.error, /not resolvable/);
});
