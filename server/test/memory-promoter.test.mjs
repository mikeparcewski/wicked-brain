import { test } from "node:test";
import assert from "node:assert/strict";
import { promoteFact, computeContentHash, slugify } from "../lib/memory-promoter.mjs";

function makeEvent(overrides = {}) {
  return {
    event_type: "wicked.fact.extracted",
    event_id: "evt-1",
    domain: "wicked-garden",
    emitted_at: 1700000000000,
    payload: {
      type: "decision",
      content: "We chose SQLite over Postgres for local-first storage.",
      entities: ["sqlite", "postgres"],
      session_id: "sess-abc",
    },
    ...overrides,
  };
}

test("decision event → semantic memory, importance 7, confidence 0.3", () => {
  const result = promoteFact(makeEvent());
  assert.equal(result.skip, false);
  assert.ok(result.memory);
  assert.equal(result.memory.frontmatter.type, "decision");
  assert.equal(result.memory.frontmatter.tier, "semantic");
  assert.equal(result.memory.frontmatter.importance, 7);
  assert.equal(result.memory.frontmatter.confidence, 0.3);
  assert.equal(result.memory.frontmatter.ttl_days, null);
  assert.equal(result.memory.frontmatter.source, "bus:wicked-garden");
});

test("discovery event → episodic, importance 4, ttl 14", () => {
  const ev = makeEvent({ payload: { type: "discovery", content: "FTS5 supports porter stemming out of the box.", entities: ["fts5"] } });
  const result = promoteFact(ev);
  assert.equal(result.skip, false);
  assert.equal(result.memory.frontmatter.tier, "episodic");
  assert.equal(result.memory.frontmatter.importance, 4);
  assert.equal(result.memory.frontmatter.ttl_days, 14);
});

test("skipped: wrong event_type", () => {
  const r = promoteFact(makeEvent({ event_type: "wicked.chunk.indexed" }));
  assert.equal(r.skip, true);
  assert.equal(r.memory, null);
});

test("skipped: type=pattern", () => {
  const r = promoteFact(makeEvent({ payload: { type: "pattern", content: "Always normalize paths to forward slashes always." } }));
  assert.equal(r.skip, true);
});

test("skipped: type=gotcha", () => {
  const r = promoteFact(makeEvent({ payload: { type: "gotcha", content: "fs.watch recursive does not work on Linux at all." } }));
  assert.equal(r.skip, true);
});

test("skipped: content under 15 chars", () => {
  const r = promoteFact(makeEvent({ payload: { type: "decision", content: "too short" } }));
  assert.equal(r.skip, true);
});

test("skipped: missing payload.content", () => {
  const r = promoteFact(makeEvent({ payload: { type: "decision" } }));
  assert.equal(r.skip, true);
});

test("content hash stable across whitespace variations", () => {
  const a = computeContentHash("Foo  bar");
  const b = computeContentHash("foo bar");
  const c = computeContentHash("  FOO\n\tbar  ");
  assert.equal(a, b);
  assert.equal(a, c);
});

test("slugify handles special chars, caps length, no empty segments", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("---weird///chars***"), "weird-chars");
  assert.equal(slugify(""), "");
  const long = slugify("a".repeat(200), 60);
  assert.equal(long.length, 60);
  // No double dashes, no leading/trailing dashes
  assert.ok(!slugify("**foo  bar**").includes("--"));
  assert.ok(!slugify("**foo bar**").startsWith("-"));
  assert.ok(!slugify("**foo bar**").endsWith("-"));
});

test("source field formatted as bus:{domain}", () => {
  const r = promoteFact(makeEvent({ domain: "my-plugin" }));
  assert.equal(r.memory.frontmatter.source, "bus:my-plugin");
  const r2 = promoteFact(makeEvent({ domain: undefined }));
  assert.equal(r2.memory.frontmatter.source, "bus:unknown");
});

test("safeName combines slug and hash prefix", () => {
  const r = promoteFact(makeEvent());
  assert.match(r.memory.safeName, /\.md$/);
  assert.ok(r.memory.safeName.includes("-"));
  // Hash prefix is 8 hex chars
  const hashPart = r.memory.safeName.replace(/\.md$/, "").split("-").pop();
  assert.match(hashPart, /^[0-9a-f]{8}$/);
});

test("entities flow to frontmatter and contains tags", () => {
  const r = promoteFact(makeEvent());
  assert.deepEqual(r.memory.frontmatter.entities.systems, ["sqlite", "postgres"]);
  assert.deepEqual(r.memory.frontmatter.entities.people, []);
  assert.ok(r.memory.frontmatter.contains.includes("sqlite"));
  assert.ok(r.memory.frontmatter.contains.includes("decision"));
  assert.ok(r.memory.frontmatter.contains.length <= 15);
});
