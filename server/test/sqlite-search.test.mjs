import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
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
