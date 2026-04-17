import { test } from "node:test";
import assert from "node:assert/strict";
import { stampWikiPointer, buildSection } from "../lib/stamp-pointer.mjs";

test("stampWikiPointer: inserts section into file with no pointer", () => {
  const before = "# My Project\n\nSome text.\n";
  const { content, changed } = stampWikiPointer(before, "./docs/wiki");
  assert.equal(changed, true);
  assert.ok(content.includes("## Contributor wiki"));
  assert.ok(content.includes("Contributor wiki: ./docs/wiki"));
  // Original content preserved.
  assert.ok(content.includes("Some text."));
});

test("stampWikiPointer: no-op when pointer already points at right path", () => {
  const before = "# My Project\n\n## Contributor wiki\n\nContributor wiki: ./docs/wiki\n";
  const { content, changed } = stampWikiPointer(before, "./docs/wiki");
  assert.equal(changed, false);
  assert.equal(content, before);
});

test("stampWikiPointer: rewrites stale pointer line in place", () => {
  const before = "# My Project\n\n## Contributor wiki\n\nContributor wiki: ./old-wiki\n\nsome prose";
  const { content, changed } = stampWikiPointer(before, "./new-wiki");
  assert.equal(changed, true);
  assert.ok(content.includes("Contributor wiki: ./new-wiki"));
  assert.ok(!content.includes("Contributor wiki: ./old-wiki"));
  // Prose preserved.
  assert.ok(content.includes("some prose"));
});

test("stampWikiPointer: treats ./docs/wiki and docs/wiki as equivalent via normalization", () => {
  // Current pointer uses trailing slash + upper-case-ish variations.
  const before = "## Contributor wiki\n\nContributor wiki: ./docs/wiki/\n";
  const { changed } = stampWikiPointer(before, "./docs/wiki");
  // Trailing slash difference is normalized — no rewrite.
  assert.equal(changed, false);
});

test("stampWikiPointer: inserts at top when no H1 is present", () => {
  const before = "Just some prose, no heading.\n";
  const { content, changed } = stampWikiPointer(before, "./docs/wiki");
  assert.equal(changed, true);
  // Section appears before the existing prose.
  const sectionIdx = content.indexOf("## Contributor wiki");
  const proseIdx = content.indexOf("Just some prose");
  assert.ok(sectionIdx < proseIdx);
});

test("stampWikiPointer: handles empty file", () => {
  const { content, changed } = stampWikiPointer("", "./docs/wiki");
  assert.equal(changed, true);
  assert.ok(content.includes("Contributor wiki: ./docs/wiki"));
});

test("stampWikiPointer: idempotent across two stamps", () => {
  const a = stampWikiPointer("# T\n\n", "./wiki");
  const b = stampWikiPointer(a.content, "./wiki");
  assert.equal(b.changed, false);
  assert.equal(a.content, b.content);
});

test("buildSection: template is stable across calls", () => {
  assert.equal(buildSection("./wiki"), buildSection("./wiki"));
  const s = buildSection("./wiki");
  assert.ok(s.startsWith("## Contributor wiki"));
  assert.ok(s.includes("Contributor wiki: ./wiki"));
});

test("stampWikiPointer: backslash path is normalized to forward slashes", () => {
  const before = "# X\n\n";
  const { content, changed } = stampWikiPointer(before, "docs\\wiki");
  assert.equal(changed, true);
  assert.ok(content.includes("Contributor wiki: docs/wiki"));
});
