import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { makeGraphActions } from "../lib/codegraph-actions.mjs";

function repoWithGraph() {
  const repo = mkdtempSync(join(tmpdir(), "cg-act-"));
  mkdirSync(join(repo, ".codegraph"), { recursive: true });
  const db = new Database(join(repo, ".codegraph", "codegraph.db"));
  db.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT, name TEXT, qualified_name TEXT,
    file_path TEXT, language TEXT, start_line INT, end_line INT, start_column INT,
    end_column INT, updated_at INT, signature TEXT);
    CREATE TABLE edges (source TEXT, target TEXT, kind TEXT, metadata TEXT, provenance TEXT);`);
  const n = db.prepare(`INSERT INTO nodes (id,kind,name,qualified_name,file_path,language,start_line,end_line,start_column,end_column,updated_at,signature) VALUES (?,?,?,?,?,?,1,1,0,0,0,NULL)`);
  n.run("file:a.py","file","a.py","a.py","a.py","python");
  n.run("file:b.py","file","b.py","b.py","b.py","python");
  db.prepare("INSERT INTO edges (source,target,kind,metadata,provenance) VALUES (?,?,?,?,?)")
    .run("file:b.py","file:a.py","imports",null,"static");  // b depends on a
  db.close();
  return repo;
}

test("graph-blast-radius action returns dependents", () => {
  const repo = repoWithGraph();
  try {
    const actions = makeGraphActions({ sourcePath: repo });
    const r = actions["graph-blast-radius"]({ node: "file:a.py" });
    assert.deepEqual(r.dependents.map((d) => d.id), ["file:b.py"]);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("graph-callers and graph-lineage are wired", () => {
  const repo = repoWithGraph();
  try {
    const actions = makeGraphActions({ sourcePath: repo });
    assert.deepEqual(actions["graph-callers"]({ node: "file:a.py" }).callers.map((d)=>d.id), ["file:b.py"]);
    assert.deepEqual(actions["graph-lineage"]({ node: "file:b.py" }).dependencies.map((d)=>d.id), ["file:a.py"]);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("graph-blast-radius on a graphless repo reports unavailable", () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-none-"));
  try {
    const actions = makeGraphActions({ sourcePath: repo });
    assert.equal(actions["graph-blast-radius"]({ node: "x" }).engine, "unavailable");
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

// ── B5: graph-index wiring ─────────────────────────────────────────────────────
//
// We don't invoke real codegraph in unit tests. The kill-switch path
// (WICKED_CODEGRAPH_BIN="") makes runIndex return {ok:false} immediately, so we
// verify that:
//   - graph-index returns {ok:false, ...} and does NOT throw
//   - the result does NOT include `injected` (extractor injection is skipped on failure)
//   - staleness is still attached

test("B5: graph-index with unresolvable codegraph returns ok:false without injected, no throw", async () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-act-b5-"));
  const prev = process.env.WICKED_CODEGRAPH_BIN;
  process.env.WICKED_CODEGRAPH_BIN = "";
  try {
    const actions = makeGraphActions({ sourcePath: repo });
    const result = await actions["graph-index"]();
    assert.equal(result.ok, false, `expected ok:false, got ${JSON.stringify(result)}`);
    assert.ok(!("injected" in result),
      `injected must NOT be present on ok:false; got keys: ${Object.keys(result).join(", ")}`);
    assert.ok("staleness" in result, "staleness must always be attached");
  } finally {
    if (prev === undefined) {
      delete process.env.WICKED_CODEGRAPH_BIN;
    } else {
      process.env.WICKED_CODEGRAPH_BIN = prev;
    }
    rmSync(repo, { recursive: true, force: true });
  }
});
