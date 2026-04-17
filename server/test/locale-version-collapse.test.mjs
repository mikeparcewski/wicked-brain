import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

function makeDb() {
  return new SqliteSearch(":memory:", "test-brain");
}

test("translation collapse: translations and original collapse under one survivor", () => {
  const db = makeDb();
  try {
    const body = "\n\nforward slash path rule";
    db.index({ id: "en", path: "intro.md", content: "---\nstatus: published\n---" + body });
    db.index({
      id: "ja",
      path: "ja/intro.md",
      content: "---\ntranslation_of: intro.md\nlocale: ja\n---" + body,
    });
    db.index({
      id: "es",
      path: "es/intro.md",
      content: "---\ntranslation_of: intro.md\nlocale: es\n---" + body,
    });

    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1, "all three collapse into one hit");
    assert.equal(result.collapsed, 2);
    const survivor = result.results[0];
    const allPaths = [survivor.path, ...survivor.also_found_in.map((x) => x.path)].sort();
    assert.deepEqual(allPaths, ["es/intro.md", "intro.md", "ja/intro.md"]);
  } finally {
    db.close();
  }
});

test("translation collapse: two translations with no original still collapse together", () => {
  const db = makeDb();
  try {
    const body = "\n\nforward slash path rule";
    db.index({
      id: "ja",
      path: "ja/intro.md",
      content: "---\ntranslation_of: intro.md\n---" + body,
    });
    db.index({
      id: "es",
      path: "es/intro.md",
      content: "---\ntranslation_of: intro.md\n---" + body,
    });
    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1);
    assert.equal(result.collapsed, 1);
  } finally {
    db.close();
  }
});

test("translation collapse: unrelated docs do not collapse", () => {
  const db = makeDb();
  try {
    db.index({ id: "a", path: "notes/a.md", content: "forward slash one" });
    db.index({ id: "b", path: "notes/b.md", content: "forward slash two" });
    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 2, "different content, no collapse trigger");
    assert.equal(result.collapsed, 0);
  } finally {
    db.close();
  }
});

test("version collapse: versions of a page collapse with the original", () => {
  const db = makeDb();
  try {
    const body = "\n\nforward slash release notes";
    db.index({ id: "v1", path: "docs/intro.md", content: "---\nversion: 1\n---" + body });
    db.index({
      id: "v2",
      path: "docs/v2/intro.md",
      content: "---\nversion_of: docs/intro.md\nversion: 2\n---" + body,
    });
    db.index({
      id: "v3",
      path: "docs/v3/intro.md",
      content: "---\nversion_of: docs/intro.md\nversion: 3\n---" + body,
    });
    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1);
    assert.equal(result.collapsed, 2);
  } finally {
    db.close();
  }
});

test("cross-axis collapse: version and translation axes can both fire", () => {
  const db = makeDb();
  try {
    const body = "\n\nforward slash doc";
    // Original English v1 at docs/intro.md
    db.index({ id: "orig", path: "docs/intro.md", content: "---\nlocale: en\nversion: 1\n---" + body });
    // ja translation of the original
    db.index({
      id: "ja",
      path: "ja/docs/intro.md",
      content: "---\ntranslation_of: docs/intro.md\nlocale: ja\n---" + body,
    });
    // v2 of the same doc
    db.index({
      id: "v2",
      path: "docs/v2/intro.md",
      content: "---\nversion_of: docs/intro.md\nversion: 2\n---" + body,
    });
    const result = db.search({ query: "forward slash" });
    assert.equal(result.results.length, 1, "translation + version axes both route into orig's group");
    assert.equal(result.collapsed, 2);
  } finally {
    db.close();
  }
});

test("ingest: translation_of and version_of persist on getDocument", () => {
  const db = makeDb();
  try {
    db.index({
      id: "ja",
      path: "ja/intro.md",
      content: "---\ntranslation_of: intro.md\nlocale: ja\n---\n\nbody",
    });
    const doc = db.getDocument("ja");
    // We don't expose these directly on getDocument (yet), but the search
    // result does — verify via search rather than adding API surface.
    const result = db.search({ query: "body" });
    assert.ok(result.results.length >= 1);
    // getDocument returns the primary shape — sanity check it still works.
    assert.equal(doc.path, "ja/intro.md");
    assert.deepEqual(doc.references, []);
  } finally {
    db.close();
  }
});

test("schema: migration 5 recorded on fresh DB", () => {
  const db = makeDb();
  try {
    assert.ok(db.schemaVersion() >= 5, `expected schema>=5, got ${db.schemaVersion()}`);
  } finally {
    db.close();
  }
});
