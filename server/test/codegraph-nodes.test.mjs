/**
 * codegraph-nodes.test.mjs — B1: self-noding helpers
 *
 * Uses the EXACT real DDL from docs/codegraph-contract.md to validate INSERTs
 * against the real NOT NULL constraints.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ensureFileNode, ensureVirtualNode } from "../lib/codegraph-nodes.mjs";

// Real DDL from docs/codegraph-contract.md — validates INSERTs against actual NOT NULL constraints
const REAL_NODES_DDL = `
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    docstring TEXT,
    signature TEXT,
    visibility TEXT,
    is_exported INTEGER DEFAULT 0,
    is_async INTEGER DEFAULT 0,
    is_static INTEGER DEFAULT 0,
    is_abstract INTEGER DEFAULT 0,
    decorators TEXT,
    type_parameters TEXT,
    updated_at INTEGER NOT NULL
)`;

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), "cg-nodes-"));
  const db = new Database(join(dir, "test.db"));
  db.exec(REAL_NODES_DDL);
  return { db, dir };
}

test("ensureFileNode inserts a file node with id file:<relpath>", () => {
  const { db, dir } = makeDb();
  try {
    const id = ensureFileNode(db, "commands/x.md");
    assert.equal(id, "file:commands/x.md");
    const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get("file:commands/x.md");
    assert.ok(row, "row must exist");
    assert.equal(row.kind, "file");
    assert.equal(row.language, "markdown");
    assert.equal(row.start_line, 1);
    assert.equal(row.end_line, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensureFileNode is idempotent — second call is a no-op (count stays 1)", () => {
  const { db, dir } = makeDb();
  try {
    ensureFileNode(db, "commands/x.md");
    ensureFileNode(db, "commands/x.md");
    const count = db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE id = ?")
      .get("file:commands/x.md").c;
    assert.equal(count, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensureVirtualNode inserts a virtual node and is idempotent", () => {
  const { db, dir } = makeDb();
  try {
    const id = ensureVirtualNode(db, "capability:foo", "capability", "foo");
    assert.equal(id, "capability:foo");
    const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get("capability:foo");
    assert.ok(row, "row must exist");
    assert.equal(row.kind, "capability");
    assert.equal(row.name, "foo");
    // idempotent
    ensureVirtualNode(db, "capability:foo", "capability", "foo");
    const count = db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE id = ?")
      .get("capability:foo").c;
    assert.equal(count, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("INSERT OR IGNORE does not overwrite a pre-existing real node", () => {
  const { db, dir } = makeDb();
  try {
    // Pre-insert a real code node with a distinct name
    db.prepare(`INSERT INTO nodes
      (id, kind, name, qualified_name, file_path, language,
       start_line, end_line, start_column, end_column, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`)
      .run("file:a.py", "file", "ORIGINAL_NAME", "a.py", "a.py", "python", 1, 100);

    // Call ensureFileNode — must be a no-op
    const id = ensureFileNode(db, "a.py");
    assert.equal(id, "file:a.py");

    const row = db.prepare("SELECT name, end_line FROM nodes WHERE id = ?").get("file:a.py");
    assert.equal(row.name, "ORIGINAL_NAME", "original name must be preserved");
    assert.equal(row.end_line, 100, "original end_line must be preserved");
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensureFileNode accepts explicit language override", () => {
  const { db, dir } = makeDb();
  try {
    ensureFileNode(db, "scripts/foo.py", "python");
    const row = db.prepare("SELECT language FROM nodes WHERE id = ?").get("file:scripts/foo.py");
    assert.equal(row.language, "python");
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
