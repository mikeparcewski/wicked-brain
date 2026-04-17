import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

function makeDb() {
  return new SqliteSearch(":memory:", "test-brain");
}

function seed(db) {
  db.index({ id: "w1", path: "wiki/a.md", content: "# Wiki A\n\nbody" });
  db.index({ id: "w2", path: "wiki/b.md", content: "# Wiki B\n\nbody" });
  db.index({ id: "c1", path: "chunks/extracted/engineering.md", content: "# Engineering\n\nbody" });
  db.index({ id: "c2", path: "notes/misc.md", content: "# Misc\n\nbody" });
  db.index({ id: "m1", path: "memory/first.md", content: "# Memory one\n\nfirst" });
  db.index({ id: "m2", path: "memories/second.md", content: "# Memory two\n\nsecond" });
}

test("listDocuments: returns every doc when no source_types filter", () => {
  const db = makeDb();
  try {
    seed(db);
    const r = db.listDocuments({ limit: 100 });
    assert.equal(r.total, 6);
    assert.equal(r.results.length, 6);
    for (const row of r.results) {
      assert.ok(["wiki", "chunk", "memory"].includes(row.source_type));
    }
  } finally {
    db.close();
  }
});

test("listDocuments: filters by source_type = wiki", () => {
  const db = makeDb();
  try {
    seed(db);
    const r = db.listDocuments({ source_types: ["wiki"], limit: 100 });
    assert.equal(r.total, 2);
    assert.ok(r.results.every((x) => x.source_type === "wiki"));
  } finally {
    db.close();
  }
});

test("listDocuments: filters by source_type = memory (both memory/ and memories/)", () => {
  const db = makeDb();
  try {
    seed(db);
    const r = db.listDocuments({ source_types: ["memory"], limit: 100 });
    assert.equal(r.total, 2);
    const paths = r.results.map((x) => x.path).sort();
    assert.deepEqual(paths, ["memories/second.md", "memory/first.md"]);
  } finally {
    db.close();
  }
});

test("listDocuments: filters by source_type = chunk (everything else)", () => {
  const db = makeDb();
  try {
    seed(db);
    const r = db.listDocuments({ source_types: ["chunk"], limit: 100 });
    assert.equal(r.total, 2);
    const paths = r.results.map((x) => x.path).sort();
    assert.deepEqual(paths, ["chunks/extracted/engineering.md", "notes/misc.md"]);
  } finally {
    db.close();
  }
});

test("listDocuments: combined filter wiki+memory", () => {
  const db = makeDb();
  try {
    seed(db);
    const r = db.listDocuments({ source_types: ["wiki", "memory"], limit: 100 });
    assert.equal(r.total, 4);
    for (const row of r.results) {
      assert.ok(["wiki", "memory"].includes(row.source_type));
    }
  } finally {
    db.close();
  }
});

test("listDocuments: orders by indexed_at DESC (most recent first)", async () => {
  const db = makeDb();
  try {
    db.index({ id: "old", path: "wiki/old.md", content: "old" });
    // Slight delay to guarantee distinct indexed_at timestamps.
    await new Promise((r) => setTimeout(r, 5));
    db.index({ id: "new", path: "wiki/new.md", content: "new" });
    const r = db.listDocuments({ limit: 100 });
    assert.equal(r.results[0].id, "new");
    assert.equal(r.results[1].id, "old");
  } finally {
    db.close();
  }
});

test("listDocuments: limit + offset paginate", () => {
  const db = makeDb();
  try {
    for (let i = 0; i < 10; i++) db.index({ id: `x${i}`, path: `wiki/${i}.md`, content: String(i) });
    const page1 = db.listDocuments({ limit: 3, offset: 0 });
    const page2 = db.listDocuments({ limit: 3, offset: 3 });
    assert.equal(page1.results.length, 3);
    assert.equal(page2.results.length, 3);
    const ids1 = page1.results.map((x) => x.id);
    const ids2 = page2.results.map((x) => x.id);
    for (const id of ids1) assert.ok(!ids2.includes(id), "pages shouldn't overlap");
    assert.equal(page1.total, 10);
  } finally {
    db.close();
  }
});

test("listDocuments: carries canonical_for + body_excerpt on each result", () => {
  const db = makeDb();
  try {
    db.index({
      id: "inv",
      path: "wiki/inv.md",
      content: "---\ncanonical_for: [INV-A]\n---\n\nActual body text here.",
    });
    const r = db.listDocuments({ source_types: ["wiki"], limit: 10 });
    assert.equal(r.results.length, 1);
    assert.deepEqual(r.results[0].canonical_for, ["INV-A"]);
    assert.ok(r.results[0].body_excerpt.includes("Actual body text"));
    assert.ok(!r.results[0].body_excerpt.includes("canonical_for:"), "frontmatter stripped");
  } finally {
    db.close();
  }
});
