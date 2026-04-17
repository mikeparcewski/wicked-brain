import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

function makeDb() {
  return new SqliteSearch(":memory:", "test-brain");
}

test("ingest: canonical_for array parsed and exposed on getDocument", () => {
  const db = makeDb();
  try {
    db.index({
      id: "inv",
      path: "wiki/invariants.md",
      content: "---\ncanonical_for: [INV-A, INV-B]\n---\n\nbody",
    });
    const doc = db.getDocument("inv");
    assert.deepEqual(doc.canonical_for, ["INV-A", "INV-B"]);
    assert.deepEqual(doc.references, []);
  } finally {
    db.close();
  }
});

test("ingest: references array parsed and exposed on getDocument", () => {
  const db = makeDb();
  try {
    db.index({
      id: "ext",
      path: "wiki/extend.md",
      content: '---\nreferences:\n  - INV-A\n  - "server/lib/sqlite-search.mjs"\n---\n\nbody',
    });
    const doc = db.getDocument("ext");
    assert.deepEqual(doc.canonical_for, []);
    assert.deepEqual(doc.references, ["INV-A", "server/lib/sqlite-search.mjs"]);
  } finally {
    db.close();
  }
});

test("ingest: every claimed ID gets its own ownership row", () => {
  const db = makeDb();
  try {
    db.index({
      id: "inv",
      path: "wiki/invariants.md",
      content: "---\ncanonical_for: [INV-A, INV-B, INV-C]\n---\n",
    });
    for (const id of ["INV-A", "INV-B", "INV-C"]) {
      assert.equal(db.canonicalOwner(id).doc_id, "inv");
    }
  } finally {
    db.close();
  }
});

test("canonicalOwner: returns doc metadata for claimed ID", () => {
  const db = makeDb();
  try {
    db.index({
      id: "inv",
      path: "wiki/invariants.md",
      content: "---\ncanonical_for: [INV-A]\n---\n",
    });
    const owner = db.canonicalOwner("INV-A");
    assert.equal(owner.doc_id, "inv");
    assert.equal(owner.path, "wiki/invariants.md");
    assert.equal(owner.brain_id, "test-brain");
  } finally {
    db.close();
  }
});

test("canonicalOwner: returns null for unclaimed ID", () => {
  const db = makeDb();
  try {
    assert.equal(db.canonicalOwner("INV-NOPE"), null);
  } finally {
    db.close();
  }
});

test("ingest: second claim for same ID is ignored (first-claimant-wins)", () => {
  const db = makeDb();
  try {
    db.index({ id: "a", path: "wiki/a.md", content: "---\ncanonical_for: [INV-X]\n---\n" });
    db.index({ id: "b", path: "wiki/b.md", content: "---\ncanonical_for: [INV-X]\n---\n" });
    const owner = db.canonicalOwner("INV-X");
    assert.equal(owner.doc_id, "a", "first claimant retains ownership");
    // The second doc's row exists with canonical_for parsed, but ownership did not transfer.
    const b = db.getDocument("b");
    assert.deepEqual(b.canonical_for, ["INV-X"], "claim stored on doc even when ownership is taken");
  } finally {
    db.close();
  }
});

test("ingest: re-indexing a doc refreshes its ownership rows", () => {
  const db = makeDb();
  try {
    db.index({ id: "inv", path: "wiki/invariants.md", content: "---\ncanonical_for: [INV-A, INV-B]\n---\n" });
    assert.equal(db.canonicalOwner("INV-A").doc_id, "inv");
    // Re-ingest with a narrower claim — INV-B should be released.
    db.index({ id: "inv", path: "wiki/invariants.md", content: "---\ncanonical_for: [INV-A]\n---\n" });
    assert.equal(db.canonicalOwner("INV-A").doc_id, "inv");
    assert.equal(db.canonicalOwner("INV-B"), null);
  } finally {
    db.close();
  }
});

test("ingest: remove() clears canonical_ownership for the doc", () => {
  const db = makeDb();
  try {
    db.index({ id: "inv", path: "wiki/invariants.md", content: "---\ncanonical_for: [INV-A]\n---\n" });
    db.remove("inv");
    assert.equal(db.canonicalOwner("INV-A"), null);
  } finally {
    db.close();
  }
});

test("ingest: reindex() clears and repopulates canonical_ownership", () => {
  const db = makeDb();
  try {
    db.index({ id: "old", path: "wiki/old.md", content: "---\ncanonical_for: [INV-OLD]\n---\n" });
    db.reindex([
      { id: "new", path: "wiki/new.md", content: "---\ncanonical_for: [INV-NEW]\n---\n" },
    ]);
    assert.equal(db.canonicalOwner("INV-OLD"), null);
    assert.equal(db.canonicalOwner("INV-NEW").doc_id, "new");
  } finally {
    db.close();
  }
});

test("ingest: doc without frontmatter has empty canonical_for and references", () => {
  const db = makeDb();
  try {
    db.index({ id: "plain", path: "notes/plain.md", content: "No frontmatter here." });
    const doc = db.getDocument("plain");
    assert.deepEqual(doc.canonical_for, []);
    assert.deepEqual(doc.references, []);
  } finally {
    db.close();
  }
});

test("ingest: malformed frontmatter does not break indexing", () => {
  const db = makeDb();
  try {
    // Invalid YAML (duplicate key) — parser throws, ingest must swallow and
    // keep indexing the body content.
    db.index({
      id: "bad",
      path: "wiki/bad.md",
      content: "---\nx: 1\nx: 2\n---\nsome body content",
    });
    const doc = db.getDocument("bad");
    assert.equal(doc.id, "bad");
    assert.ok(doc.content.includes("body content"));
    assert.deepEqual(doc.canonical_for, []);
  } finally {
    db.close();
  }
});

test("schema: migration 4 marker recorded on fresh DB", () => {
  const db = makeDb();
  try {
    assert.ok(db.schemaVersion() >= 4, `expected schema>=4, got ${db.schemaVersion()}`);
  } finally {
    db.close();
  }
});

test("schema: migration 4 upgrades a v3 database in place", () => {
  // Build a v3 DB (pre-canonical): has content_hash but lacks canonical_for/refs
  // and canonical_ownership table. Open via SqliteSearch and confirm upgrade.
  const tmpPath = join(tmpdir(), `wicked-brain-migration4-test-${Date.now()}.db`);
  try {
    const v3 = new Database(tmpPath);
    v3.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, path TEXT NOT NULL, content TEXT NOT NULL,
        frontmatter TEXT, brain_id TEXT NOT NULL, indexed_at INTEGER NOT NULL,
        content_hash TEXT
      );
      CREATE INDEX idx_documents_content_hash ON documents(content_hash);
      CREATE VIRTUAL TABLE documents_fts USING fts5(id, path, content, brain_id, tokenize='porter unicode61');
      CREATE TABLE links (
        source_id TEXT NOT NULL, source_brain TEXT NOT NULL,
        target_path TEXT NOT NULL, target_brain TEXT, rel TEXT, link_text TEXT,
        confidence REAL DEFAULT 0.5, evidence_count INTEGER DEFAULT 0
      );
      CREATE INDEX idx_links_source ON links(source_id);
      CREATE INDEX idx_links_target ON links(target_path);
      CREATE TABLE access_log (
        doc_id TEXT NOT NULL, session_id TEXT NOT NULL, accessed_at INTEGER NOT NULL
      );
      CREATE INDEX idx_access_doc ON access_log(doc_id);
      CREATE INDEX idx_access_session ON access_log(session_id);
      CREATE TABLE search_misses (query TEXT NOT NULL, searched_at INTEGER NOT NULL, session_id TEXT);
      CREATE TABLE _schema_version (version INTEGER NOT NULL);
    `);
    v3.prepare(`INSERT INTO _schema_version (version) VALUES (?)`).run(3);
    // Seed one doc to simulate existing data surviving the migration.
    v3.prepare(
      `INSERT INTO documents (id, path, content, frontmatter, brain_id, indexed_at, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("old", "wiki/old.md", "old body", null, "test-brain", Date.now(), null);
    v3.close();

    const db = new SqliteSearch(tmpPath, "test-brain");
    try {
      assert.ok(db.schemaVersion() >= 4, "schema should upgrade to >=4");
      // Pre-existing row survives with empty canonical_for / references
      const old = db.getDocument("old");
      assert.equal(old.id, "old");
      assert.deepEqual(old.canonical_for, []);
      assert.deepEqual(old.references, []);
      // Canonical ingest works on the upgraded DB
      db.index({ id: "inv", path: "wiki/inv.md", content: "---\ncanonical_for: [INV-X]\n---\n" });
      assert.equal(db.canonicalOwner("INV-X").doc_id, "inv");
    } finally {
      db.close();
    }
  } finally {
    try { unlinkSync(tmpPath); } catch {}
    try { unlinkSync(tmpPath + "-wal"); } catch {}
    try { unlinkSync(tmpPath + "-shm"); } catch {}
  }
});
