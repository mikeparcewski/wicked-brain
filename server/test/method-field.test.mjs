import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatterBlock, parseFrontmatter } from "../lib/frontmatter.mjs";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

// Cross-pollination R1 (Factory B1 / G4): the `method:` frontmatter field
// records the EXTRACTION METHOD (provenance — "how do we know this") that
// produced a chunk or memory. It is distinct from `source_type` (file format).
//
// These tests pin the field's contract end-to-end. `method` is plain
// frontmatter: the documents table stores the raw frontmatter blob, so the
// field rides through index() -> getDocument() verbatim with NO schema
// migration. The skills (ingest/memory) are the authoring instructions; this
// test proves the storage + parse path the skills depend on actually carries
// the field, and that it stays OPTIONAL so pre-existing content is still valid.

function makeDb() {
  return new SqliteSearch(":memory:", "test-brain");
}

// --- Parse layer (what wicked-brain:lint reads when validating frontmatter) ---

test("method: parsed as a scalar string from a chunk frontmatter block", () => {
  const d = parseFrontmatterBlock(
    [
      "source: notes.md",
      "source_type: md",
      "chunk_id: notes/chunk-001",
      "method: deterministic-parse",
      "confidence: 0.7",
    ].join("\n"),
  );
  assert.equal(d.method, "deterministic-parse");
  // method must NOT collide with source_type — they answer different questions
  // (provenance vs file format).
  assert.equal(d.source_type, "md");
  assert.notEqual(d.method, d.source_type);
});

test("method: each controlled chunk/memory value round-trips through the parser", () => {
  for (const value of [
    "deterministic-parse",
    "llm-vision",
    "llm-synthesis",
    "manual",
    "session-capture",
  ]) {
    const { data } = parseFrontmatter(`---\nmethod: ${value}\n---\n\nbody`);
    assert.equal(data.method, value, `method should parse as "${value}"`);
  }
});

// --- Storage layer (index -> getDocument), no migration required ---

test("ingest: a chunk's method survives index() -> getDocument() in raw frontmatter", () => {
  const db = makeDb();
  try {
    const content = [
      "---",
      "source: design-doc.md",
      "source_type: md",
      "chunk_id: design-doc/chunk-001",
      "method: deterministic-parse",
      "confidence: 0.7",
      'indexed_at: "2026-06-17T00:00:00Z"',
      "---",
      "",
      "The auth service uses JWT with a 15-minute expiry.",
    ].join("\n");
    db.index({ id: "design-doc/chunk-001", path: "chunks/extracted/design-doc/chunk-001.md", content });

    const doc = db.getDocument("design-doc/chunk-001");
    assert.ok(doc, "document should be retrievable");
    // The raw frontmatter blob is stored and returned verbatim.
    assert.match(doc.frontmatter, /method:\s*deterministic-parse/);
    // ...and re-parses to the controlled value.
    const fm = parseFrontmatterBlock(doc.frontmatter);
    assert.equal(fm.method, "deterministic-parse");
  } finally {
    db.close();
  }
});

test("memory: a memory's method survives index() -> getDocument() in raw frontmatter", () => {
  const db = makeDb();
  try {
    const content = [
      "---",
      "type: decision",
      "tier: semantic",
      "method: session-capture",
      "confidence: 0.5",
      "importance: 7",
      "ttl_days: null",
      'indexed_at: "2026-06-17T00:00:00Z"',
      "---",
      "",
      "Decided to store refresh tokens in HttpOnly cookies.",
    ].join("\n");
    db.index({ id: "memory/refresh-token-decision", path: "memory/refresh-token-decision.md", content });

    const doc = db.getDocument("memory/refresh-token-decision");
    assert.ok(doc, "memory should be retrievable");
    assert.match(doc.frontmatter, /method:\s*session-capture/);
    const fm = parseFrontmatterBlock(doc.frontmatter);
    assert.equal(fm.method, "session-capture");
  } finally {
    db.close();
  }
});

// --- Backward compatibility: method is OPTIONAL ---

test("method is optional: a chunk WITHOUT method still indexes and is retrievable", () => {
  const db = makeDb();
  try {
    const content = [
      "---",
      "source: legacy.md",
      "source_type: md",
      "chunk_id: legacy/chunk-001",
      "confidence: 0.7",
      'indexed_at: "2026-06-17T00:00:00Z"',
      "---",
      "",
      "Pre-existing chunk authored before the method field existed.",
    ].join("\n");
    db.index({ id: "legacy/chunk-001", path: "chunks/extracted/legacy/chunk-001.md", content });

    const doc = db.getDocument("legacy/chunk-001");
    assert.ok(doc, "legacy document must still be retrievable");
    assert.ok(doc.content.includes("Pre-existing chunk"));
    // No method present — lint treats this as `method: unknown` (info-only),
    // it must NOT block indexing or invalidate the document.
    const fm = parseFrontmatterBlock(doc.frontmatter);
    assert.equal(fm.method ?? null, null, "absent method parses as missing, not an error");
  } finally {
    db.close();
  }
});

// --- The lint "no source => assumption" provenance check (C3), as a pure
//     predicate over parsed frontmatter, so the rule is unit-tested even though
//     the lint skill itself is markdown instructions. ---

test("lint predicate: unsourced chunk with a non-inferred method is flagged", () => {
  // Mirrors the rule documented in wicked-brain:lint: a chunk with no
  // source/source_path whose method is not in {llm-synthesis, unknown} is an
  // unsourced fact that should be flagged.
  const INFERRED = new Set(["llm-synthesis", "unknown"]);
  const isUnsourcedFact = (fm) => {
    const hasSource = Boolean(fm.source || fm.source_path);
    const method = fm.method ?? "unknown";
    return !hasSource && !INFERRED.has(method);
  };

  // unsourced + deterministic-parse => flagged
  assert.equal(isUnsourcedFact({ method: "deterministic-parse" }), true);
  // unsourced + llm-synthesis => NOT flagged (inference is allowed to be sourceless)
  assert.equal(isUnsourcedFact({ method: "llm-synthesis" }), false);
  // unsourced + no method (=> unknown) => NOT flagged as "unsourced fact"
  // (it is caught by the separate missing-method info check instead)
  assert.equal(isUnsourcedFact({}), false);
  // sourced + deterministic-parse => NOT flagged
  assert.equal(isUnsourcedFact({ source: "doc.md", method: "deterministic-parse" }), false);
});
