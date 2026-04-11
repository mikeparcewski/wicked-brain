import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

// Use in-memory databases for testing
let db;

function makeDb() {
  return new SqliteSearch(":memory:", "test-brain");
}

test("indexes and searches documents", () => {
  const db = makeDb();
  try {
    db.index({ id: "note1", path: "notes/hello.md", content: "Hello world of wikilinks" });
    db.index({ id: "note2", path: "notes/other.md", content: "Another document about planets" });

    const result = db.search({ query: "hello" });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, "note1");
    assert.equal(result.total_matches, 1);
    assert.equal(result.showing, 1);
  } finally {
    db.close();
  }
});

test("removes a document", () => {
  const db = makeDb();
  try {
    db.index({ id: "note1", path: "notes/hello.md", content: "Hello world" });
    db.index({ id: "note2", path: "notes/other.md", content: "Other content" });

    db.remove("note1");

    const result = db.search({ query: "Hello" });
    assert.equal(result.results.length, 0);

    // note2 should still be searchable
    const result2 = db.search({ query: "Other" });
    assert.equal(result2.results.length, 1);
  } finally {
    db.close();
  }
});

test("respects limit and offset", () => {
  const db = makeDb();
  try {
    for (let i = 0; i < 5; i++) {
      db.index({ id: `doc${i}`, path: `doc${i}.md`, content: `content document item ${i}` });
    }

    const page1 = db.search({ query: "content document", limit: 2, offset: 0 });
    assert.equal(page1.results.length, 2);
    assert.equal(page1.total_matches, 5);

    const page2 = db.search({ query: "content document", limit: 2, offset: 2 });
    assert.equal(page2.results.length, 2);

    const page3 = db.search({ query: "content document", limit: 2, offset: 4 });
    assert.equal(page3.results.length, 1);
  } finally {
    db.close();
  }
});

test("tracks backlinks", () => {
  const db = makeDb();
  try {
    db.index({ id: "note1", path: "note1.md", content: "References [[note2]] and [[note3]]" });
    db.index({ id: "note2", path: "note2.md", content: "References [[note3]]" });
    db.index({ id: "note3", path: "note3.md", content: "No outgoing links" });

    const backlinks = db.backlinks("note3");
    assert.equal(backlinks.length, 2);
    const sourceIds = backlinks.map((b) => b.source_id).sort();
    assert.deepEqual(sourceIds, ["note1", "note2"]);
  } finally {
    db.close();
  }
});

test("tracks forward links", () => {
  const db = makeDb();
  try {
    db.index({ id: "note1", path: "note1.md", content: "See [[target-a]] and [[target-b]]" });

    const forwardLinks = db.forwardLinks("note1");
    assert.equal(forwardLinks.length, 2);
    assert.ok(forwardLinks.includes("target-a"));
    assert.ok(forwardLinks.includes("target-b"));
  } finally {
    db.close();
  }
});

test("returns stats", () => {
  const db = makeDb();
  try {
    db.index({ id: "d1", path: "wiki/page.md", content: "Wiki content" });
    db.index({ id: "d2", path: "chunks/chunk1.md", content: "Chunk content" });
    db.index({ id: "d3", path: "notes/regular.md", content: "Regular content" });

    const stats = db.stats();
    assert.equal(stats.total, 3);
    assert.equal(stats.chunks, 1);
    assert.equal(stats.wiki, 1);
    assert.ok(stats.last_indexed !== null);
  } finally {
    db.close();
  }
});

test("reindex replaces all documents", () => {
  const db = makeDb();
  try {
    db.index({ id: "old1", path: "old1.md", content: "Old document one" });
    db.index({ id: "old2", path: "old2.md", content: "Old document two" });

    db.reindex([
      { id: "new1", path: "new1.md", content: "New document alpha" },
      { id: "new2", path: "new2.md", content: "New document beta" },
    ]);

    // Old docs should be gone
    const oldResult = db.search({ query: "Old" });
    assert.equal(oldResult.results.length, 0);

    // New docs should be present
    const newResult = db.search({ query: "New" });
    assert.equal(newResult.results.length, 2);
  } finally {
    db.close();
  }
});

test("backlink-weighted search ranks linked doc higher", () => {
  const db = makeDb();
  try {
    // Doc B and Doc C have identical content so FTS rank is the same.
    // Doc A links to Doc B, giving B one backlink. C is an orphan.
    db.index({ id: "docA", path: "docA.md", content: "Intro see [[docB.md]] for details about quantum physics" });
    db.index({ id: "docB", path: "docB.md", content: "Quantum physics detailed explanation" });
    db.index({ id: "docC", path: "docC.md", content: "Quantum physics detailed explanation" });

    const result = db.search({ query: "quantum physics" });
    // Both B and C should appear
    assert.ok(result.results.length >= 2);

    const idxB = result.results.findIndex((r) => r.id === "docB");
    const idxC = result.results.findIndex((r) => r.id === "docC");
    assert.ok(idxB !== -1, "docB should appear in results");
    assert.ok(idxC !== -1, "docC should appear in results");
    // B should rank higher (appear earlier) than C because of backlink boost
    assert.ok(idxB < idxC, `docB (index ${idxB}) should rank higher than docC (index ${idxC})`);

    // B should have backlink_count = 1, C should have 0
    assert.equal(result.results[idxB].backlink_count, 1);
    assert.equal(result.results[idxC].backlink_count, 0);
  } finally {
    db.close();
  }
});

test("since parameter filters by indexed_at", () => {
  const db = makeDb();
  try {
    // Index a doc, then wait a moment and record a timestamp, then index another
    db.index({ id: "old1", path: "old1.md", content: "Machine learning basics" });

    // We need a timestamp between the two indexing operations.
    // Since indexing uses Date.now(), we grab a cutoff after the first index.
    const cutoff = new Date(Date.now() + 1).toISOString();

    // Small busy-wait to ensure the second doc gets a later timestamp
    const start = Date.now();
    while (Date.now() - start < 5) { /* wait 5ms */ }

    db.index({ id: "new1", path: "new1.md", content: "Machine learning advanced" });

    // Without since, both should appear
    const all = db.search({ query: "machine learning" });
    assert.equal(all.results.length, 2);

    // With since, only the newer doc should appear
    const recent = db.search({ query: "machine learning", since: cutoff });
    assert.equal(recent.results.length, 1);
    assert.equal(recent.results[0].id, "new1");
    assert.equal(recent.total_matches, 1);
  } finally {
    db.close();
  }
});

test("stores and retrieves typed relationship links", () => {
  const db = makeDb();
  try {
    db.index({
      id: "doc1",
      path: "wiki/new-claim.md",
      content: "This [[contradicts::wiki/old-claim]] and [[supports::wiki/evidence]]",
    });
    db.index({
      id: "doc2",
      path: "wiki/other.md",
      content: "See [[wiki/new-claim]] for details",
    });

    const contradictions = db.contradictions();
    assert.equal(contradictions.length, 1);
    assert.equal(contradictions[0].source_id, "doc1");
    assert.equal(contradictions[0].target_path, "wiki/old-claim");
  } finally {
    db.close();
  }
});

test("health returns ok", () => {
  const db = makeDb();
  try {
    const health = db.health();
    assert.equal(health.status, "ok");
    assert.equal(health.brain_id, "test-brain");
    assert.ok(typeof health.uptime === "number");
    assert.ok(health.uptime >= 0);
  } finally {
    db.close();
  }
});

test("search with session_id records access log entries", () => {
  const db = makeDb();
  try {
    db.index({ id: "doc1", path: "chunks/a.md", content: "Alpha beta gamma" });
    db.index({ id: "doc2", path: "chunks/b.md", content: "Alpha delta epsilon" });

    db.search({ query: "alpha", session_id: "session-001" });

    const logs = db.accessLog("doc1");
    assert.equal(logs.access_count, 1);
    assert.equal(logs.session_diversity, 1);
  } finally {
    db.close();
  }
});

test("session diversity tracks distinct sessions", () => {
  const db = makeDb();
  try {
    db.index({ id: "doc1", path: "chunks/a.md", content: "Alpha content here" });

    // Same session twice
    db.search({ query: "alpha", session_id: "session-001" });
    db.search({ query: "alpha", session_id: "session-001" });
    // Different session
    db.search({ query: "alpha", session_id: "session-002" });

    const logs = db.accessLog("doc1");
    assert.equal(logs.access_count, 3);
    assert.equal(logs.session_diversity, 2);
  } finally {
    db.close();
  }
});

test("access count boosts search ranking", () => {
  const db = makeDb();
  try {
    // Two docs with identical content
    db.index({ id: "popular", path: "chunks/popular.md", content: "Identical topic content here" });
    db.index({ id: "obscure", path: "chunks/obscure.md", content: "Identical topic content here" });

    // Make "popular" doc accessed many times
    for (let i = 0; i < 10; i++) {
      db.search({ query: "identical topic", session_id: `session-${i}` });
    }

    // Now search again — popular should rank higher
    const result = db.search({ query: "identical topic" });
    const idxPopular = result.results.findIndex((r) => r.id === "popular");
    const idxObscure = result.results.findIndex((r) => r.id === "obscure");
    assert.ok(idxPopular < idxObscure, "popular doc should rank higher due to access count");
  } finally {
    db.close();
  }
});

test("candidates promote returns highest-scored docs first", () => {
  const db = makeDb();
  try {
    // Index three chunks: one with access, one with backlinks, one orphan
    db.index({ id: "c1", path: "chunks/popular.md", content: "Popular chunk" });
    db.index({ id: "c2", path: "chunks/linked.md", content: "Linked chunk" });
    db.index({ id: "c3", path: "chunks/orphan.md", content: "Orphan chunk" });
    // linker has backlink pointing to c2
    db.index({ id: "linker", path: "chunks/linker.md", content: "See [[chunks/linked.md]]" });
    // c1 gets accessed
    db.search({ query: "popular", session_id: "s1" });
    db.search({ query: "popular", session_id: "s2" });

    const result = db.candidates({ mode: "promote", limit: 10 });
    assert.ok(result.length >= 2);
    // c1 (accessed) and c2 (linked) should appear before c3 (orphan)
    const paths = result.map((r) => r.path);
    const idxOrphan = paths.indexOf("chunks/orphan.md");
    const idxPopular = paths.indexOf("chunks/popular.md");
    const idxLinked = paths.indexOf("chunks/linked.md");
    assert.ok(idxPopular < idxOrphan, "popular should rank above orphan");
    assert.ok(idxLinked < idxOrphan, "linked should rank above orphan");
  } finally {
    db.close();
  }
});

test("candidates archive returns old zero-access zero-backlink docs", () => {
  const db = makeDb();
  try {
    // Index docs — they'll have recent indexed_at so won't match archive by default
    db.index({ id: "old1", path: "chunks/old.md", content: "Old content" });
    db.index({ id: "new1", path: "chunks/new.md", content: "New content" });

    // Archive mode with recent docs should return empty (all < 30 days old)
    const result = db.candidates({ mode: "archive", limit: 10 });
    assert.equal(result.length, 0, "recent docs should not be archive candidates");
  } finally {
    db.close();
  }
});

test("recentMemories returns memory docs from last N days", () => {
  const db = makeDb();
  try {
    db.index({ id: "mem1", path: "memory/decision-a.md", content: "Decision about auth" });
    db.index({ id: "mem2", path: "memory/gotcha-b.md", content: "Watch out for X" });
    db.index({ id: "chunk1", path: "chunks/extracted/foo/chunk-001.md", content: "Some chunk" });

    const result = db.recentMemories({ days: 1, limit: 10 });
    assert.equal(result.length, 2); // only memory/ paths
    assert.ok(result.every(r => r.path.startsWith("memory/")));

    const result2 = db.recentMemories({ days: 1, limit: 1 });
    assert.equal(result2.length, 1); // respects limit
  } finally {
    db.close();
  }
});

test("search without session_id does not log access", () => {
  const db = makeDb();
  try {
    db.index({ id: "doc1", path: "chunks/a.md", content: "Alpha content" });

    db.search({ query: "alpha" }); // no session_id

    const logs = db.accessLog("doc1");
    assert.equal(logs.access_count, 0);
  } finally {
    db.close();
  }
});

test("body_excerpt contains body text, not frontmatter tag list", () => {
  const db = makeDb();
  try {
    // Simulate a chunk with a rich contains: tag list that repeats the query terms,
    // followed by body text that actually explains the concept.
    const content = `---
name: specialist-routing
contains: specialist routing logic crew phases dispatch orchestration
indexed_at: 2026-04-08
---

Specialist routing works by inspecting the crew phase and dispatching
to the appropriate handler based on the role map. Each specialist receives
a scoped context with only the fields relevant to their domain.`;

    db.index({ id: "chunk1", path: "chunks/extracted/routing/chunk-001.md", content });

    const result = db.search({ query: "specialist routing" });
    assert.equal(result.results.length, 1);

    const { body_excerpt, snippet } = result.results[0];

    // body_excerpt must not contain frontmatter keys or the contains: list
    assert.ok(!body_excerpt.includes("contains:"), `body_excerpt should not include frontmatter 'contains:' key: ${body_excerpt}`);
    assert.ok(!body_excerpt.includes("indexed_at:"), `body_excerpt should not include frontmatter keys: ${body_excerpt}`);

    // body_excerpt should contain actual body text
    assert.ok(body_excerpt.includes("dispatching") || body_excerpt.includes("crew phase") || body_excerpt.includes("handler"),
      `body_excerpt should contain body text, got: ${body_excerpt}`);

    // snippet field is still present for backward compat
    assert.ok(typeof snippet === "string", "snippet should still be present");
  } finally {
    db.close();
  }
});

// --- confirmLink tests ---

test("confirmLink with confirm increases confidence and evidence_count", () => {
  const db = makeDb();
  try {
    db.index({ id: "src", path: "src.md", content: "See [[target.md]] for details" });

    const updated = db.confirmLink("src", "target.md", "confirm");
    assert.ok(updated !== null, "should return updated link");
    assert.ok(updated.confidence > 0.5, "confidence should increase above default 0.5");
    assert.equal(updated.evidence_count, 1, "evidence_count should be 1");
    assert.equal(updated.confidence, 0.6);
  } finally {
    db.close();
  }
});

test("confirmLink with contradict decreases confidence", () => {
  const db = makeDb();
  try {
    db.index({ id: "src", path: "src.md", content: "See [[target.md]] for details" });

    const updated = db.confirmLink("src", "target.md", "contradict");
    assert.ok(updated !== null, "should return updated link");
    assert.ok(updated.confidence < 0.5, "confidence should decrease below default 0.5");
    assert.equal(updated.confidence, 0.3);
    assert.equal(updated.evidence_count, 1);
  } finally {
    db.close();
  }
});

test("confirmLink clamps confidence to [0.0, 1.0]", () => {
  const db = makeDb();
  try {
    db.index({ id: "src", path: "src.md", content: "See [[target.md]] for details" });

    // Drive confidence to maximum
    for (let i = 0; i < 10; i++) {
      db.confirmLink("src", "target.md", "confirm");
    }
    const high = db.confirmLink("src", "target.md", "confirm");
    assert.equal(high.confidence, 1.0, "confidence should be clamped at 1.0");

    // Drive confidence to minimum
    for (let i = 0; i < 10; i++) {
      db.confirmLink("src", "target.md", "contradict");
    }
    const low = db.confirmLink("src", "target.md", "contradict");
    assert.equal(low.confidence, 0.0, "confidence should be clamped at 0.0");
  } finally {
    db.close();
  }
});

test("confirmLink returns null for non-existent link", () => {
  const db = makeDb();
  try {
    const result = db.confirmLink("nonexistent", "also-nonexistent.md", "confirm");
    assert.equal(result, null);
  } finally {
    db.close();
  }
});

// --- linkHealth tests ---

test("linkHealth returns correct broken link count", () => {
  const db = makeDb();
  try {
    // doc-a links to doc-b (which exists) and to ghost.md (which does NOT exist)
    db.index({ id: "doc-a", path: "doc-a.md", content: "See [[doc-b.md]] and [[ghost.md]]" });
    db.index({ id: "doc-b", path: "doc-b.md", content: "I exist" });

    const health = db.linkHealth();
    assert.equal(health.total_links, 2);
    assert.equal(health.broken_links, 1, "only ghost.md is broken");
    assert.ok(typeof health.avg_confidence === "number");
    assert.ok(health.avg_confidence >= 0 && health.avg_confidence <= 1);
  } finally {
    db.close();
  }
});

test("linkHealth reports low_confidence_links correctly", () => {
  const db = makeDb();
  try {
    db.index({ id: "src", path: "src.md", content: "See [[target.md]]" });

    // Drive confidence below 0.3
    db.confirmLink("src", "target.md", "contradict");
    db.confirmLink("src", "target.md", "contradict");

    const health = db.linkHealth();
    assert.equal(health.low_confidence_links, 1);
  } finally {
    db.close();
  }
});

// --- tagFrequency tests ---

test("tagFrequency counts inline space-separated tags", () => {
  const db = makeDb();
  try {
    db.index({ id: "d1", path: "chunks/a.md", content: "Body", frontmatter: "contains: foo bar foo" });
    db.index({ id: "d2", path: "chunks/b.md", content: "Body", frontmatter: "contains: bar baz" });

    const tags = db.tagFrequency();
    const fooEntry = tags.find((t) => t.tag === "foo");
    const barEntry = tags.find((t) => t.tag === "bar");
    const bazEntry = tags.find((t) => t.tag === "baz");
    assert.equal(fooEntry.count, 2, "foo appears in 2 docs (once per doc)");
    assert.equal(barEntry.count, 2, "bar appears in 2 docs");
    assert.equal(bazEntry.count, 1, "baz appears in 1 doc");
  } finally {
    db.close();
  }
});

test("tagFrequency parses JSON array contains", () => {
  const db = makeDb();
  try {
    db.index({ id: "d1", path: "chunks/a.md", content: "Body", frontmatter: 'contains: ["alpha","beta"]' });

    const tags = db.tagFrequency();
    const alphaEntry = tags.find((t) => t.tag === "alpha");
    const betaEntry = tags.find((t) => t.tag === "beta");
    assert.ok(alphaEntry, "alpha tag should be present");
    assert.ok(betaEntry, "beta tag should be present");
    assert.equal(alphaEntry.count, 1);
    assert.equal(betaEntry.count, 1);
  } finally {
    db.close();
  }
});

test("tagFrequency parses YAML block list", () => {
  const db = makeDb();
  try {
    const fm = "name: test\ncontains:\n  - tag1\n  - tag2\n  - tag1\n";
    db.index({ id: "d1", path: "chunks/a.md", content: "Body", frontmatter: fm });

    const tags = db.tagFrequency();
    const t1 = tags.find((t) => t.tag === "tag1");
    const t2 = tags.find((t) => t.tag === "tag2");
    assert.ok(t1, "tag1 should be present");
    assert.ok(t2, "tag2 should be present");
    assert.equal(t1.count, 2, "tag1 appears twice in block list");
    assert.equal(t2.count, 1);
  } finally {
    db.close();
  }
});

test("tagFrequency returns empty array when no frontmatter", () => {
  const db = makeDb();
  try {
    db.index({ id: "d1", path: "chunks/a.md", content: "No frontmatter here" });

    const tags = db.tagFrequency();
    assert.ok(Array.isArray(tags));
    assert.equal(tags.length, 0);
  } finally {
    db.close();
  }
});

// --- confirmLink edge case tests ---

test("confirmLink throws on unknown verdict", () => {
  const db = makeDb();
  try {
    db.index({ id: "src", path: "src.md", content: "See [[target.md]]" });

    assert.throws(
      () => db.confirmLink("src", "target.md", "maybe"),
      { message: /Unknown verdict: maybe/ }
    );
  } finally {
    db.close();
  }
});

// --- linkHealth edge case tests ---

test("linkHealth on empty db returns null avg_confidence and zero counts", () => {
  const db = makeDb();
  try {
    const health = db.linkHealth();
    assert.equal(health.total_links, 0);
    assert.equal(health.avg_confidence, null);
    assert.equal(health.broken_links, 0);
    assert.equal(health.low_confidence_links, 0);
  } finally {
    db.close();
  }
});

// --- searchMisses tests ---

test("searchMisses logs when search returns 0 results", () => {
  const db = makeDb();
  try {
    db.index({ id: "doc1", path: "doc1.md", content: "Hello world content" });

    db.search({ query: "xyznonexistentterm" });

    const { misses } = { misses: db.searchMisses() };
    assert.equal(misses.length, 1);
    assert.equal(misses[0].query, "xyznonexistentterm");
  } finally {
    db.close();
  }
});

test("searchMisses since parameter filters by timestamp", () => {
  const db = makeDb();
  try {
    db.index({ id: "doc1", path: "doc1.md", content: "Hello world content" });

    // Generate a miss
    db.search({ query: "xyzoldmiss" });

    const cutoff = new Date(Date.now() + 1).toISOString();
    const start = Date.now();
    while (Date.now() - start < 5) { /* wait 5ms */ }

    // Generate a newer miss
    db.search({ query: "xyznewmiss" });

    // Without since, both should appear
    const all = db.searchMisses();
    assert.equal(all.length, 2);

    // With since, only the newer miss should appear
    const recent = db.searchMisses({ since: cutoff });
    assert.equal(recent.length, 1);
    assert.equal(recent[0].query, "xyznewmiss");
  } finally {
    db.close();
  }
});

test("searchMisses records session_id from search call", () => {
  const db = makeDb();
  try {
    db.index({ id: "doc1", path: "doc1.md", content: "Hello world content" });

    db.search({ query: "xyznonexistentterm", session_id: "sess-abc" });

    const misses = db.searchMisses();
    assert.equal(misses.length, 1);
    assert.equal(misses[0].session_id, "sess-abc");
  } finally {
    db.close();
  }
});

test("searchMisses does NOT log when results exist", () => {
  const db = makeDb();
  try {
    db.index({ id: "doc1", path: "doc1.md", content: "Hello world content" });

    db.search({ query: "hello" });

    const misses = db.searchMisses();
    assert.equal(misses.length, 0, "no miss should be logged when results are found");
  } finally {
    db.close();
  }
});

// --- Migration tests ---

test("schemaVersion returns current version for new database", () => {
  const db = makeDb();
  try {
    const version = db.schemaVersion();
    assert.ok(version >= 1, `Schema version should be >= 1, got ${version}`);
  } finally {
    db.close();
  }
});

test("migration upgrades a v0 database to current schema", () => {
  // Create a file-based v0 database WITHOUT rel column and WITHOUT access_log
  const tmpPath = join(tmpdir(), `wicked-brain-migration-test-${Date.now()}.db`);
  try {
    // Create the v0 database
    const v0 = new Database(tmpPath);
    v0.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, path TEXT NOT NULL, content TEXT NOT NULL,
        frontmatter TEXT, brain_id TEXT NOT NULL, indexed_at INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE documents_fts USING fts5(id, path, content, brain_id, tokenize='porter unicode61');
      CREATE TABLE links (
        source_id TEXT NOT NULL, source_brain TEXT NOT NULL,
        target_path TEXT NOT NULL, target_brain TEXT, link_text TEXT
      );
      CREATE INDEX idx_links_source ON links(source_id);
      CREATE INDEX idx_links_target ON links(target_path);
    `);
    v0.close();

    // Open with SqliteSearch — should migrate
    const db = new SqliteSearch(tmpPath, "test-brain");
    try {
      // rel column should exist now
      db.index({
        id: "test1", path: "test.md",
        content: "Testing [[contradicts::old-claim]]"
      });
      const contradictions = db.contradictions();
      assert.ok(Array.isArray(contradictions), "contradictions() should work after migration");

      // access_log should exist
      db.search({ query: "testing", session_id: "s1" });
      const logs = db.accessLog("test1");
      assert.equal(logs.access_count, 1, "access_log should work after migration");

      // schema version should be current
      const version = db.schemaVersion();
      assert.ok(version >= 1, "Schema version should be set after migration");
    } finally {
      db.close();
    }
  } finally {
    try { unlinkSync(tmpPath); } catch {}
    try { unlinkSync(tmpPath + "-wal"); } catch {}
    try { unlinkSync(tmpPath + "-shm"); } catch {}
  }
});

test("migration 2 upgrades a v1 database to add confidence and evidence_count columns", () => {
  const tmpPath = join(tmpdir(), `wicked-brain-migration2-test-${Date.now()}.db`);
  try {
    // Create a v1 database: has rel column but NOT confidence/evidence_count
    const v1 = new Database(tmpPath);
    v1.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, path TEXT NOT NULL, content TEXT NOT NULL,
        frontmatter TEXT, brain_id TEXT NOT NULL, indexed_at INTEGER NOT NULL
      );
      CREATE VIRTUAL TABLE documents_fts USING fts5(id, path, content, brain_id, tokenize='porter unicode61');
      CREATE TABLE links (
        source_id TEXT NOT NULL, source_brain TEXT NOT NULL,
        target_path TEXT NOT NULL, target_brain TEXT, rel TEXT, link_text TEXT
      );
      CREATE INDEX idx_links_source ON links(source_id);
      CREATE INDEX idx_links_target ON links(target_path);
      CREATE TABLE access_log (
        doc_id TEXT NOT NULL, session_id TEXT NOT NULL, accessed_at INTEGER NOT NULL
      );
      CREATE INDEX idx_access_doc ON access_log(doc_id);
      CREATE INDEX idx_access_session ON access_log(session_id);
      CREATE TABLE _schema_version (version INTEGER NOT NULL);
    `);
    v1.prepare(`INSERT INTO _schema_version (version) VALUES (?)`).run(1);
    v1.close();

    // Open with SqliteSearch — should run migration 2
    const db = new SqliteSearch(tmpPath, "test-brain");
    try {
      const version = db.schemaVersion();
      assert.equal(version, 2, "Schema version should be 2 after migration");

      // confidence and evidence_count should exist — confirmLink should work
      db.index({ id: "t1", path: "t1.md", content: "See [[target.md]]" });
      const updated = db.confirmLink("t1", "target.md", "confirm");
      assert.ok(updated !== null, "confirmLink should work after migration 2");
      assert.equal(updated.confidence, 0.6);

      // search_misses table should exist
      db.search({ query: "xyznonexistent99" });
      const misses = db.searchMisses();
      assert.equal(misses.length, 1, "search_misses table should exist after migration 2");
    } finally {
      db.close();
    }
  } finally {
    try { unlinkSync(tmpPath); } catch {}
    try { unlinkSync(tmpPath + "-wal"); } catch {}
    try { unlinkSync(tmpPath + "-shm"); } catch {}
  }
});

test("symbols returns FTS results with source_path from frontmatter", () => {
  const db = makeDb();
  try {
    const frontmatter = `---\nsource: UserEntity.java\nsource_path: /src/main/UserEntity.java\nsource_type: java\ncontains:\n  - entity\n---`;
    db.index({ id: "chunks/extracted/UserEntity/chunk-001.md", path: "chunks/extracted/UserEntity/chunk-001.md", content: `${frontmatter}\n\npublic class UserEntity { String email; }` });
    db.index({ id: "chunks/extracted/OrderEntity/chunk-001.md", path: "chunks/extracted/OrderEntity/chunk-001.md", content: "public class OrderEntity {}" });

    const result = db.symbols({ name: "UserEntity", limit: 5 });
    assert.ok(result.results.length >= 1, "should find at least one result");
    const hit = result.results[0];
    assert.equal(hit.file_path, "/src/main/UserEntity.java");
    assert.ok(hit.id.includes("UserEntity"));
  } finally {
    db.close();
  }
});

test("dependents returns unique source_path files mentioning the name", () => {
  const db = makeDb();
  try {
    const fm1 = `---\nsource: UserService.java\nsource_path: /src/UserService.java\n---`;
    const fm2 = `---\nsource: UserController.java\nsource_path: /src/UserController.java\n---`;
    const fm3 = `---\nsource: OrderService.java\nsource_path: /src/OrderService.java\n---`;
    db.index({ id: "c1", path: "c1.md", content: `${fm1}\n\nUserEntity repo = new UserEntity()` });
    db.index({ id: "c2", path: "c2.md", content: `${fm2}\n\nUserEntity user = service.getUser()` });
    db.index({ id: "c3", path: "c3.md", content: `${fm3}\n\nOrderEntity order = new OrderEntity()` });

    const result = db.dependents({ name: "UserEntity", limit: 10 });
    assert.ok(result.files.includes("/src/UserService.java"), "should include UserService");
    assert.ok(result.files.includes("/src/UserController.java"), "should include UserController");
    assert.ok(!result.files.includes("/src/OrderService.java"), "should not include OrderService");
  } finally {
    db.close();
  }
});

test("index auto-extracts frontmatter from content", () => {
  const db = makeDb();
  try {
    const content = `---\nsource: foo.md\nsource_path: /docs/foo.md\n---\n\nsome body text`;
    db.index({ id: "doc1", path: "doc1.md", content });
    // dependents relies on auto-extracted frontmatter
    const result = db.dependents({ name: "body", limit: 5 });
    assert.ok(result.files.includes("/docs/foo.md"), "auto-extracted source_path should be used");
  } finally {
    db.close();
  }
});
