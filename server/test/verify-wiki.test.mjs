import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

function makeDb() {
  return new SqliteSearch(":memory:", "test-brain");
}

// Compute the first-8-char SHA-256 of a chunk body the same way verifyWiki
// does. Tests build `source_hashes` against this so they pin the contract
// rather than re-implementing it inline.
function bodyHash(body) {
  return createHash("sha256").update(body).digest("hex").slice(0, 8);
}

function chunkContent(body) {
  return `---\nauthored_by: test\n---\n${body}`;
}

function wikiContent(sources) {
  const paths = sources.map((s) => `  - ${s.path}`).join("\n");
  const hashes = sources.map((s) => `  - ${s.path}: ${s.hash}`).join("\n");
  return `---\nauthored_by: llm\nsource_chunks:\n${paths}\nsource_hashes:\n${hashes}\n---\n\n# Article body`;
}

test("verify_wiki: fresh article — every hash matches", () => {
  const db = makeDb();
  try {
    const body = "chunk body content";
    db.index({ id: "chunk-a", path: "chunks/extracted/a.md", content: chunkContent(body) });
    db.index({
      id: "article",
      path: "wiki/concepts/foo.md",
      content: wikiContent([{ path: "chunks/extracted/a.md", hash: bodyHash(body) }]),
    });
    const result = db.verifyWiki();
    assert.equal(result.summary.total, 1);
    assert.equal(result.summary.fresh, 1);
    assert.equal(result.summary.stale, 0);
    assert.equal(result.articles[0].status, "fresh");
    assert.equal(result.articles[0].source_count, 1);
    assert.equal(result.articles[0].matched, 1);
    assert.deepEqual(result.articles[0].mismatched, []);
    assert.deepEqual(result.articles[0].missing, []);
  } finally {
    db.close();
  }
});

test("verify_wiki: stale when a source chunk body has drifted", () => {
  const db = makeDb();
  try {
    const oldBody = "original content";
    const oldHash = bodyHash(oldBody);
    db.index({ id: "chunk-a", path: "chunks/extracted/a.md", content: chunkContent(oldBody) });
    db.index({
      id: "article",
      path: "wiki/concepts/foo.md",
      content: wikiContent([{ path: "chunks/extracted/a.md", hash: oldHash }]),
    });
    // Drift: re-ingest chunk with different body.
    db.index({ id: "chunk-a", path: "chunks/extracted/a.md", content: chunkContent("new content") });
    const result = db.verifyWiki();
    assert.equal(result.summary.stale, 1);
    assert.equal(result.articles[0].status, "stale");
    assert.deepEqual(result.articles[0].mismatched, ["chunks/extracted/a.md"]);
    assert.deepEqual(result.articles[0].missing, []);
  } finally {
    db.close();
  }
});

test("verify_wiki: orphaned when every referenced chunk is missing", () => {
  const db = makeDb();
  try {
    db.index({
      id: "article",
      path: "wiki/concepts/foo.md",
      content: wikiContent([
        { path: "chunks/extracted/gone.md", hash: "deadbeef" },
        { path: "chunks/extracted/also-gone.md", hash: "cafef00d" },
      ]),
    });
    const result = db.verifyWiki();
    assert.equal(result.articles[0].status, "orphaned");
    assert.equal(result.articles[0].source_count, 2);
    assert.equal(result.articles[0].matched, 0);
    assert.deepEqual(result.articles[0].missing.sort(), [
      "chunks/extracted/also-gone.md",
      "chunks/extracted/gone.md",
    ]);
  } finally {
    db.close();
  }
});

test("verify_wiki: partial missing + matched is classified stale", () => {
  const db = makeDb();
  try {
    const body = "present chunk";
    db.index({ id: "chunk-a", path: "chunks/extracted/a.md", content: chunkContent(body) });
    db.index({
      id: "article",
      path: "wiki/concepts/foo.md",
      content: wikiContent([
        { path: "chunks/extracted/a.md", hash: bodyHash(body) },
        { path: "chunks/extracted/b.md", hash: "deadbeef" },
      ]),
    });
    const result = db.verifyWiki();
    assert.equal(result.articles[0].status, "stale");
    assert.equal(result.articles[0].matched, 1);
    assert.deepEqual(result.articles[0].missing, ["chunks/extracted/b.md"]);
    assert.deepEqual(result.articles[0].mismatched, []);
  } finally {
    db.close();
  }
});

test("verify_wiki: unverifiable when article has no source_hashes field", () => {
  const db = makeDb();
  try {
    db.index({
      id: "article",
      path: "wiki/concepts/legacy.md",
      content: "---\nauthored_by: llm\nsource_chunks:\n  - chunks/extracted/a.md\n---\n\nbody",
    });
    const result = db.verifyWiki();
    assert.equal(result.articles[0].status, "unverifiable");
    assert.equal(result.summary.unverifiable, 1);
  } finally {
    db.close();
  }
});

test("verify_wiki: path param scopes the scan to a single article", () => {
  const db = makeDb();
  try {
    const body = "x";
    db.index({ id: "chunk-a", path: "chunks/extracted/a.md", content: chunkContent(body) });
    db.index({
      id: "one",
      path: "wiki/concepts/one.md",
      content: wikiContent([{ path: "chunks/extracted/a.md", hash: bodyHash(body) }]),
    });
    db.index({
      id: "two",
      path: "wiki/concepts/two.md",
      content: wikiContent([{ path: "chunks/extracted/a.md", hash: "deadbeef" }]),
    });
    const scoped = db.verifyWiki({ path: "wiki/concepts/two.md" });
    assert.equal(scoped.articles.length, 1);
    assert.equal(scoped.articles[0].path, "wiki/concepts/two.md");
    assert.equal(scoped.articles[0].status, "stale");
  } finally {
    db.close();
  }
});

test("verify_wiki: ignores non-wiki documents", () => {
  const db = makeDb();
  try {
    // A chunk that happens to carry source_hashes-shaped frontmatter must
    // not be scanned — only wiki/* paths are in scope.
    db.index({
      id: "chunk-x",
      path: "chunks/extracted/x.md",
      content: wikiContent([{ path: "whatever.md", hash: "deadbeef" }]),
    });
    const result = db.verifyWiki();
    assert.equal(result.summary.total, 0);
    assert.deepEqual(result.articles, []);
  } finally {
    db.close();
  }
});

test("verify_wiki: stamps documents.last_verified_at", () => {
  const db = makeDb();
  try {
    const before = Date.now();
    db.index({
      id: "article",
      path: "wiki/concepts/foo.md",
      content: wikiContent([{ path: "chunks/extracted/missing.md", hash: "deadbeef" }]),
    });
    db.verifyWiki();
    const doc = db.getDocument("article");
    assert.ok(
      doc.last_verified_at != null,
      "last_verified_at must be populated after verify",
    );
    assert.ok(
      doc.last_verified_at >= before,
      `last_verified_at=${doc.last_verified_at} must be >= ${before}`,
    );
  } finally {
    db.close();
  }
});

test("verify_wiki: empty brain returns zero summary without error", () => {
  const db = makeDb();
  try {
    const result = db.verifyWiki();
    assert.deepEqual(result.summary, {
      total: 0, fresh: 0, stale: 0, orphaned: 0, unverifiable: 0,
    });
    assert.deepEqual(result.articles, []);
  } finally {
    db.close();
  }
});

test("schema: migration 6 marker recorded on fresh DB", () => {
  const db = makeDb();
  try {
    assert.ok(db.schemaVersion() >= 6, `expected schema>=6, got ${db.schemaVersion()}`);
  } finally {
    db.close();
  }
});

test("schema: migration 6 upgrades a v5 database in place", () => {
  // Build a v5 DB by hand, open it via SqliteSearch, and confirm the
  // last_verified_at column is added and existing rows survive.
  const tmpPath = join(tmpdir(), `wicked-brain-migration6-test-${Date.now()}.db`);
  try {
    const v5 = new Database(tmpPath);
    v5.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, path TEXT NOT NULL, content TEXT NOT NULL,
        frontmatter TEXT, brain_id TEXT NOT NULL, indexed_at INTEGER NOT NULL,
        content_hash TEXT, canonical_for TEXT, refs TEXT,
        translation_of TEXT, version_of TEXT
      );
      CREATE INDEX idx_documents_content_hash ON documents(content_hash);
      CREATE VIRTUAL TABLE documents_fts USING fts5(id, path, content, brain_id, tokenize='porter unicode61');
      CREATE TABLE canonical_ownership (
        canonical_id TEXT PRIMARY KEY, doc_id TEXT NOT NULL,
        path TEXT NOT NULL, brain_id TEXT NOT NULL
      );
      CREATE INDEX idx_canonical_doc ON canonical_ownership(doc_id);
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
    v5.prepare(`INSERT INTO _schema_version (version) VALUES (?)`).run(5);
    v5.prepare(
      `INSERT INTO documents (id, path, content, frontmatter, brain_id, indexed_at, content_hash, canonical_for, refs, translation_of, version_of)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("old", "wiki/old.md", "old body", null, "test-brain", Date.now(), null, null, null, null, null);
    v5.close();

    const db = new SqliteSearch(tmpPath, "test-brain");
    try {
      assert.ok(db.schemaVersion() >= 6, `expected schema>=6, got ${db.schemaVersion()}`);
      // Existing row survives, last_verified_at reads as null.
      const doc = db.getDocument("old");
      assert.equal(doc.id, "old");
      assert.equal(doc.last_verified_at ?? null, null);
    } finally {
      db.close();
    }
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
});
