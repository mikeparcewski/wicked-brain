import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWikilinks } from "../lib/wikilinks.mjs";

test("parses simple wikilinks", () => {
  const result = parseWikilinks("See [[my/note]] for details.");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { brain: null, path: "my/note", rel: null, raw: "[[my/note]]" });
});

test("parses cross-brain wikilinks", () => {
  const result = parseWikilinks("Reference [[otherbrain::some/path]] here.");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { brain: "otherbrain", path: "some/path", rel: null, raw: "[[otherbrain::some/path]]" });
});

test("parses multiple links", () => {
  const result = parseWikilinks("[[note-a]] and [[brain2::note-b]] and [[note-c]].");
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], { brain: null, path: "note-a", rel: null, raw: "[[note-a]]" });
  assert.deepEqual(result[1], { brain: "brain2", path: "note-b", rel: null, raw: "[[brain2::note-b]]" });
  assert.deepEqual(result[2], { brain: null, path: "note-c", rel: null, raw: "[[note-c]]" });
});

test("returns empty array for no links", () => {
  const result = parseWikilinks("No links here.");
  assert.equal(result.length, 0);
  assert.deepEqual(result, []);
});

test("ignores empty [[ ]] and [[]]", () => {
  const result = parseWikilinks("Empty [[ ]] and [[]] should be ignored.");
  assert.equal(result.length, 0);
});

test("ignores cross-brain link missing brain or path", () => {
  // [[::path]] — no brain/rel
  const r1 = parseWikilinks("[[::path]]");
  assert.equal(r1.length, 0);
  // [[brain::]] — no path
  const r2 = parseWikilinks("[[brain::]]");
  assert.equal(r2.length, 0);
});

test("parses typed relationship links", () => {
  const result = parseWikilinks("This [[contradicts::wiki/old-claim]] the previous finding.");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    brain: null,
    path: "wiki/old-claim",
    rel: "contradicts",
    raw: "[[contradicts::wiki/old-claim]]",
  });
});

test("parses all known relationship types", () => {
  const rels = ["contradicts", "supersedes", "supports", "caused-by", "extends", "depends-on"];
  for (const rel of rels) {
    const result = parseWikilinks(`[[${rel}::some/target]]`);
    assert.equal(result.length, 1, `should parse ${rel} link`);
    assert.equal(result[0].rel, rel);
    assert.equal(result[0].path, "some/target");
    assert.equal(result[0].brain, null);
  }
});

test("distinguishes typed links from cross-brain links", () => {
  const result = parseWikilinks("[[contradicts::claim-a]] and [[otherbrain::note-b]]");
  assert.equal(result.length, 2);
  // First is a typed rel link
  assert.equal(result[0].rel, "contradicts");
  assert.equal(result[0].brain, null);
  assert.equal(result[0].path, "claim-a");
  // Second is a cross-brain link
  assert.equal(result[1].rel, null);
  assert.equal(result[1].brain, "otherbrain");
  assert.equal(result[1].path, "note-b");
});

test("unknown :: prefix treated as cross-brain, not rel", () => {
  const result = parseWikilinks("[[mybrain::some/path]]");
  assert.equal(result.length, 1);
  assert.equal(result[0].brain, "mybrain");
  assert.equal(result[0].rel, null);
  assert.equal(result[0].path, "some/path");
});
