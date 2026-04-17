import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

function makeDb() {
  return new SqliteSearch(":memory:", "test-brain");
}

test("collapse: identical content_hash collapses duplicates under best survivor", () => {
  const db = makeDb();
  try {
    // Two different docs, same text, same content_hash.
    const body = "forward slash invariant about path storage";
    const fm = "---\ncontent_hash: same-hash-abc\n---\n";
    db.index({ id: "a", path: "wiki/a.md", content: fm + body });
    db.index({ id: "b", path: "wiki/b.md", content: fm + body });

    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1, "one survivor after collapse");
    assert.equal(result.collapsed, 1, "one absorbed into also_found_in");
    const survivor = result.results[0];
    assert.equal(survivor.also_found_in.length, 1);
    assert.ok(["wiki/a.md", "wiki/b.md"].includes(survivor.path));
    assert.ok(["wiki/a.md", "wiki/b.md"].includes(survivor.also_found_in[0].path));
    assert.notEqual(survivor.path, survivor.also_found_in[0].path);
  } finally {
    db.close();
  }
});

test("collapse: rival canonical_for claimants collapse to best-scoring row", () => {
  const db = makeDb();
  try {
    // Both docs claim INV-X but their content differs. The FTS ranker will
    // still score both; collapse keeps one.
    db.index({
      id: "a",
      path: "wiki/a.md",
      content: "---\ncanonical_for: [INV-X]\n---\n\nforward slash forward slash forward slash",
    });
    db.index({
      id: "b",
      path: "wiki/b.md",
      content: "---\ncanonical_for: [INV-X]\n---\n\nforward slash",
    });

    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1);
    assert.equal(result.collapsed, 1);
    const survivor = result.results[0];
    assert.deepEqual(survivor.canonical_for, ["INV-X"]);
    assert.equal(survivor.also_found_in.length, 1);
  } finally {
    db.close();
  }
});

test("collapse: reference-only page does NOT collapse into canonical owner", () => {
  const db = makeDb();
  try {
    // Two pages about the same concept, but only one claims canonical_for.
    // The other references it. They are different content — must not collapse.
    db.index({
      id: "inv",
      path: "wiki/invariants.md",
      content: "---\ncanonical_for: [INV-X]\n---\n\nforward slash rule canonical",
    });
    db.index({
      id: "ext",
      path: "wiki/extend.md",
      content: "---\nreferences: [INV-X]\n---\n\nforward slash usage in extension",
    });

    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 2, "references ≠ canonical_for; both kept");
    assert.equal(result.collapsed, 0);
  } finally {
    db.close();
  }
});

test("collapse: canonical_for and content_hash keys both register against the same survivor", () => {
  const db = makeDb();
  try {
    // 3 docs: a and b share content_hash; b and c share canonical_for: [X].
    // Expect all three to collapse into a single survivor.
    const body = "path normalization story for the forward slash rule";
    db.index({
      id: "a",
      path: "wiki/a.md",
      content: "---\ncontent_hash: h1\n---\n\n" + body,
    });
    db.index({
      id: "b",
      path: "wiki/b.md",
      content: "---\ncontent_hash: h1\ncanonical_for: [INV-X]\n---\n\n" + body,
    });
    db.index({
      id: "c",
      path: "wiki/c.md",
      content: "---\ncanonical_for: [INV-X]\n---\n\nother text about forward slash",
    });

    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1, "all three collapse transitively");
    assert.equal(result.collapsed, 2);
    assert.equal(result.results[0].also_found_in.length, 2);
  } finally {
    db.close();
  }
});

test("collapse: null content_hash does not collapse unrelated docs", () => {
  const db = makeDb();
  try {
    // Two docs, no content_hash, no canonical_for — different content.
    db.index({ id: "a", path: "notes/a.md", content: "forward slash one" });
    db.index({ id: "b", path: "notes/b.md", content: "forward slash two" });

    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 2);
    assert.equal(result.collapsed, 0);
  } finally {
    db.close();
  }
});

test("collapse: also_found_in is capped", () => {
  const db = makeDb();
  try {
    const body = "shared-text about forward slash indexing";
    const fm = "---\ncontent_hash: shared-hash\n---\n";
    for (let i = 0; i < 10; i++) {
      db.index({ id: `d${i}`, path: `wiki/d${i}.md`, content: fm + body });
    }
    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].also_found_in.length, 5, "capped at 5");
    assert.equal(result.collapsed, 5, "5 fit into also_found_in; 4 dropped silently");
  } finally {
    db.close();
  }
});

test("collapse: results still include canonical_for on survivor for agent consumption", () => {
  const db = makeDb();
  try {
    db.index({
      id: "inv",
      path: "wiki/invariants.md",
      content: "---\ncanonical_for: [INV-A, INV-B]\n---\n\nforward slash rule",
    });
    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1);
    assert.deepEqual(result.results[0].canonical_for, ["INV-A", "INV-B"]);
    assert.deepEqual(result.results[0].also_found_in, []);
  } finally {
    db.close();
  }
});

test("collapse: empty query still returns empty shape with collapsed:0", () => {
  const db = makeDb();
  try {
    const result = db.search({ query: "" });
    assert.deepEqual(result.results, []);
    assert.equal(result.total_matches, 0);
  } finally {
    db.close();
  }
});
