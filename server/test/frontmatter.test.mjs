import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractFrontmatter,
  parseFrontmatter,
  parseFrontmatterBlock,
  serializeFrontmatterBlock,
  getField,
} from "../lib/frontmatter.mjs";

test("extractFrontmatter: returns null for content with no fence", () => {
  const r = extractFrontmatter("# Just a heading\n\nbody");
  assert.equal(r.frontmatter, null);
  assert.equal(r.body, "# Just a heading\n\nbody");
});

test("extractFrontmatter: separates frontmatter and body", () => {
  const r = extractFrontmatter("---\ntitle: foo\n---\n\nbody text");
  assert.equal(r.frontmatter, "title: foo");
  assert.equal(r.body, "\nbody text");
});

test("extractFrontmatter: handles CRLF line endings", () => {
  const r = extractFrontmatter("---\r\ntitle: foo\r\n---\r\nbody");
  assert.equal(r.frontmatter, "title: foo");
});

test("parseFrontmatterBlock: empty block returns {}", () => {
  assert.deepEqual(parseFrontmatterBlock(""), {});
  assert.deepEqual(parseFrontmatterBlock(null), {});
});

test("parseFrontmatterBlock: flat strings, quotes stripped", () => {
  const d = parseFrontmatterBlock('title: Getting Started\nowner: "core team"');
  assert.equal(d.title, "Getting Started");
  assert.equal(d.owner, "core team");
});

test("parseFrontmatterBlock: booleans, numbers, null", () => {
  const d = parseFrontmatterBlock("override: true\nversion: 2\nreviewer: null");
  assert.equal(d.override, true);
  assert.equal(d.version, 2);
  assert.equal(d.reviewer, null);
});

test("parseFrontmatterBlock: dates kept as strings", () => {
  const d = parseFrontmatterBlock("last_reviewed: 2026-04-10");
  assert.equal(d.last_reviewed, "2026-04-10");
});

test("parseFrontmatterBlock: inline array", () => {
  const d = parseFrontmatterBlock("canonical_for: [INV-A, INV-B, INV-C]");
  assert.deepEqual(d.canonical_for, ["INV-A", "INV-B", "INV-C"]);
});

test("parseFrontmatterBlock: inline array with quoted element containing comma", () => {
  const d = parseFrontmatterBlock('tags: [simple, "with, comma", last]');
  assert.deepEqual(d.tags, ["simple", "with, comma", "last"]);
});

test("parseFrontmatterBlock: empty inline array", () => {
  const d = parseFrontmatterBlock("tags: []");
  assert.deepEqual(d.tags, []);
});

test("parseFrontmatterBlock: block array", () => {
  const input = ["references:", "  - CLAUDE.md", "  - server/lib/sqlite-search.mjs"].join("\n");
  const d = parseFrontmatterBlock(input);
  assert.deepEqual(d.references, ["CLAUDE.md", "server/lib/sqlite-search.mjs"]);
});

test("parseFrontmatterBlock: block array followed by another key", () => {
  const input = [
    "references:",
    "  - CLAUDE.md",
    "  - server/lib/sqlite-search.mjs",
    "owner: core",
  ].join("\n");
  const d = parseFrontmatterBlock(input);
  assert.deepEqual(d.references, ["CLAUDE.md", "server/lib/sqlite-search.mjs"]);
  assert.equal(d.owner, "core");
});

test("parseFrontmatterBlock: comments ignored", () => {
  const input = "# a comment\ntitle: x\n# another\nowner: y";
  const d = parseFrontmatterBlock(input);
  assert.equal(d.title, "x");
  assert.equal(d.owner, "y");
});

test("parseFrontmatterBlock: blank lines ignored", () => {
  const d = parseFrontmatterBlock("a: 1\n\n\nb: 2");
  assert.equal(d.a, 1);
  assert.equal(d.b, 2);
});

test("parseFrontmatterBlock: duplicate key throws", () => {
  assert.throws(() => parseFrontmatterBlock("a: 1\na: 2"), /duplicate key/);
});

test("parseFrontmatterBlock: missing colon throws", () => {
  assert.throws(() => parseFrontmatterBlock("just a line"), /key: value/);
});

test("parseFrontmatterBlock: unterminated inline array throws", () => {
  assert.throws(() => parseFrontmatterBlock("tags: [a, b"), /unterminated/);
});

test("parseFrontmatter: combines extract + parse", () => {
  const content = '---\ncanonical_for: [INV-A]\nstatus: published\n---\n\n# Body\n';
  const { data, body } = parseFrontmatter(content);
  assert.deepEqual(data.canonical_for, ["INV-A"]);
  assert.equal(data.status, "published");
  assert.equal(body, "\n# Body\n");
});

test("parseFrontmatter: no frontmatter returns empty data + full body", () => {
  const { data, body } = parseFrontmatter("# Just body\ntext");
  assert.deepEqual(data, {});
  assert.equal(body, "# Just body\ntext");
});

test("getField: returns null for missing key", () => {
  assert.equal(getField({}, "nope"), null);
  assert.equal(getField(null, "x"), null);
});

test("getField: distinguishes falsy values from missing", () => {
  const d = { flag: false, count: 0, name: "" };
  assert.equal(getField(d, "flag"), false);
  assert.equal(getField(d, "count"), 0);
  assert.equal(getField(d, "name"), "");
});

test("serialize: inline short array", () => {
  const s = serializeFrontmatterBlock({ canonical_for: ["INV-A", "INV-B"] });
  assert.equal(s, "canonical_for: [INV-A, INV-B]");
});

test("serialize: block form for long array", () => {
  const s = serializeFrontmatterBlock({
    refs: Array.from({ length: 10 }, (_, i) => `item-${i}-with-longish-name`),
  });
  assert.ok(s.includes("refs:\n  - item-0"));
});

test("serialize: quotes values with special chars", () => {
  const s = serializeFrontmatterBlock({ note: "has: colon" });
  assert.equal(s, 'note: "has: colon"');
});

test("round-trip: parse then serialize then parse yields same shape", () => {
  const original = {
    canonical_for: ["INV-A", "INV-B"],
    status: "published",
    override: true,
    version: 2,
  };
  const serialized = serializeFrontmatterBlock(original);
  const reparsed = parseFrontmatterBlock(serialized);
  assert.deepEqual(reparsed, original);
});
