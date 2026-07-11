import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { CodegraphClient } from "../lib/codegraph-client.mjs";

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "cg-client-"));
  mkdirSync(join(repo, ".codegraph"), { recursive: true });
  const db = new Database(join(repo, ".codegraph", "codegraph.db"));
  db.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT, name TEXT, qualified_name TEXT,
      file_path TEXT, language TEXT, start_line INT, end_line INT,
      start_column INT, end_column INT, updated_at INT, signature TEXT);
    CREATE TABLE edges (source TEXT, target TEXT, kind TEXT, metadata TEXT, provenance TEXT);
  `);
  const n = db.prepare(`INSERT INTO nodes
    (id,kind,name,qualified_name,file_path,language,start_line,end_line,start_column,end_column,updated_at,signature)
    VALUES (?,?,?,?,?,?,?,?,0,0,0,?)`);
  n.run("file:a.py", "file", "a.py", "a.py", "a.py", "python", 1, 1, null);
  n.run("file:b.py", "file", "b.py", "b.py", "b.py", "python", 1, 2, null);
  n.run("file:c.py", "file", "c.py", "c.py", "c.py", "python", 1, 2, null);
  // edge(source=dependent, target=dependency): b depends on a, c depends on b
  const e = db.prepare("INSERT INTO edges (source,target,kind,metadata,provenance) VALUES (?,?,?,?,?)");
  e.run("file:b.py", "file:a.py", "imports", null, "static");
  e.run("file:c.py", "file:b.py", "calls", null, "static");
  db.close();
  return repo;
}

test("blastRadius returns transitive dependents of a node", () => {
  const repo = makeRepo();
  try {
    const c = new CodegraphClient(repo);
    const r = c.blastRadius({ node: "file:a.py" });
    assert.deepEqual(r.dependents.map((d) => d.id).sort(), ["file:b.py", "file:c.py"]);
    assert.equal(r.staleness.present, true);
    c.close();
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("callers returns direct dependents only", () => {
  const repo = makeRepo();
  try {
    const c = new CodegraphClient(repo);
    const r = c.callers({ node: "file:a.py" });
    assert.deepEqual(r.callers.map((d) => d.id), ["file:b.py"]);
    c.close();
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("lineage returns transitive dependencies (downstream)", () => {
  const repo = makeRepo();
  try {
    const c = new CodegraphClient(repo);
    const r = c.lineage({ node: "file:c.py" });
    assert.deepEqual(r.dependencies.map((d) => d.id).sort(), ["file:a.py", "file:b.py"]);
    c.close();
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("missing db -> engine unavailable, not an empty graph", () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-empty-"));
  try {
    const c = new CodegraphClient(repo);
    const r = c.blastRadius({ node: "file:a.py" });
    assert.equal(r.engine, "unavailable");
    c.close();
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("a cycle does not infinite-loop", () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-cycle-"));
  mkdirSync(join(repo, ".codegraph"), { recursive: true });
  const db = new Database(join(repo, ".codegraph", "codegraph.db"));
  db.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT, name TEXT, qualified_name TEXT,
    file_path TEXT, language TEXT, start_line INT, end_line INT, start_column INT,
    end_column INT, updated_at INT, signature TEXT);
    CREATE TABLE edges (source TEXT, target TEXT, kind TEXT, metadata TEXT, provenance TEXT);`);
  const n = db.prepare(`INSERT INTO nodes (id,kind,name,qualified_name,file_path,language,start_line,end_line,start_column,end_column,updated_at,signature) VALUES (?,?,?,?,?,?,1,1,0,0,0,NULL)`);
  n.run("file:x.py","file","x.py","x.py","x.py","python"); n.run("file:y.py","file","y.py","y.py","y.py","python");
  const e = db.prepare("INSERT INTO edges (source,target,kind,metadata,provenance) VALUES (?,?,?,?,?)");
  e.run("file:x.py","file:y.py","calls",null,"static"); e.run("file:y.py","file:x.py","calls",null,"static");
  db.close();
  try {
    const c = new CodegraphClient(repo);
    const r = c.blastRadius({ node: "file:x.py" });
    assert.deepEqual(r.dependents.map((d) => d.id).sort(), ["file:y.py"]);
    c.close();
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
