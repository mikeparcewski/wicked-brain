import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWikilinks } from "../lib/wikilinks.mjs";

test("parses simple wikilinks", () => {
  const result = parseWikilinks("See [[my/note]] for details.");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { brain: null, path: "my/note", raw: "[[my/note]]" });
});

test("parses cross-brain wikilinks", () => {
  const result = parseWikilinks("Reference [[otherbrain::some/path]] here.");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { brain: "otherbrain", path: "some/path", raw: "[[otherbrain::some/path]]" });
});

test("parses multiple links", () => {
  const result = parseWikilinks("[[note-a]] and [[brain2::note-b]] and [[note-c]].");
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], { brain: null, path: "note-a", raw: "[[note-a]]" });
  assert.deepEqual(result[1], { brain: "brain2", path: "note-b", raw: "[[brain2::note-b]]" });
  assert.deepEqual(result[2], { brain: null, path: "note-c", raw: "[[note-c]]" });
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
  // [[::path]] — no brain
  const r1 = parseWikilinks("[[::path]]");
  assert.equal(r1.length, 0);
  // [[brain::]] — no path
  const r2 = parseWikilinks("[[brain::]]");
  assert.equal(r2.length, 0);
});
