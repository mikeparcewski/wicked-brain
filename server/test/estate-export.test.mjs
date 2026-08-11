// Tests for the brain → estate EXPORT phase (server/lib/estate-export.mjs):
// bundle shapes, real tuned-signal values, read-only source guarantees.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  exportBundle,
  readBrainDb,
  buildTelemetry,
  readBrainId,
  BUNDLE_FORMAT,
  BRAIN_DEFAULT_CONFIDENCE,
} from "../lib/estate-export.mjs";
import {
  buildFixtureBrain,
  FIXTURE_BRAIN_ID,
  ALPHA_CHUNK,
  WIKI_TOPIC,
  MEMORY_DOC,
  GHOST_DOC_ID,
} from "./fixtures/build-fixture-brain.mjs";

function jsonl(path) {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function freshBrain() {
  const dir = mkdtempSync(join(tmpdir(), "wb-estate-export-"));
  const brainPath = join(dir, "brain");
  const dbPath = buildFixtureBrain(brainPath);
  return { dir, brainPath, dbPath };
}

test("readBrainDb returns every table with all columns and brain defaults applied", () => {
  const { dbPath } = freshBrain();
  const { documents, links, accessLog, searchMisses } = readBrainDb(dbPath);

  assert.equal(documents.length, 4);
  const alpha = documents.find((d) => d.path === ALPHA_CHUNK);
  assert.ok(alpha);
  // Every documents column must survive (zero-loss export).
  for (const col of [
    "id", "path", "content", "frontmatter", "brain_id", "indexed_at",
    "content_hash", "canonical_for", "refs", "translation_of", "version_of",
    "last_verified_at",
  ]) {
    assert.ok(col in alpha, `documents column '${col}' missing from export`);
  }
  assert.equal(alpha.content_hash, "abc12345");
  assert.equal(alpha.source_type, "chunk");
  assert.equal(documents.find((d) => d.path === MEMORY_DOC).source_type, "memory");
  assert.equal(documents.find((d) => d.path === WIKI_TOPIC).source_type, "wiki");

  // 5 wikilink rows + 1 raw cross-brain row.
  assert.equal(links.length, 6);
  // The tuned link carries its REAL values (confirmLink ran 4 times).
  const tuned = links.find(
    (l) => l.source_id === ALPHA_CHUNK && l.target_path === WIKI_TOPIC && l.evidence_count === 4,
  );
  assert.ok(tuned, "tuned link not exported");
  assert.ok(Math.abs(tuned.confidence - 0.9) < 1e-9);
  // Un-tuned links carry the brain default, present EXPLICITLY (estate's
  // relate default is 0.8 — an omitted value would silently retune).
  for (const l of links) {
    assert.equal(typeof l.confidence, "number", "confidence must never be omitted");
    assert.equal(typeof l.evidence_count, "number");
  }
  const untuned = links.find((l) => l.source_id === MEMORY_DOC);
  assert.equal(untuned.confidence, BRAIN_DEFAULT_CONFIDENCE);
  // Typed link rel survives.
  const typed = links.find((l) => l.source_id === WIKI_TOPIC);
  assert.equal(typed.rel, "supports");
  // Cross-brain link survives with its target_brain.
  assert.ok(links.some((l) => l.target_brain === "other-brain"));

  assert.equal(accessLog.length, 3);
  assert.equal(searchMisses.length, 2);
});

test("buildTelemetry produces the exact import-telemetry file shape (epoch millis, doc_id→item_id)", () => {
  const { dbPath } = freshBrain();
  const { accessLog, searchMisses } = readBrainDb(dbPath);
  const t = buildTelemetry(accessLog, searchMisses);

  assert.deepEqual(Object.keys(t).sort(), ["access_log", "search_misses"]);
  assert.equal(t.access_log.length, 3);
  for (const row of t.access_log) {
    assert.deepEqual(Object.keys(row).sort(), ["accessed_at", "item_id", "session_id"]);
    assert.equal(typeof row.accessed_at, "number"); // epoch millis, unchanged
  }
  // doc_id maps to item_id (PR #95 contract).
  assert.ok(t.access_log.some((r) => r.item_id === GHOST_DOC_ID));
  assert.equal(t.search_misses.length, 2);
  const nullSession = t.search_misses.find((r) => r.query === "vault evidence gate");
  assert.equal(nullSession.session_id, null, "NULL session_id must be preserved, not coerced");
  assert.equal(nullSession.searched_at, 1700000400000);
});

test("buildTelemetry preserves an out-of-contract NULL access_log session_id as null, never the string 'null'", () => {
  // Brain's access_log.session_id is NOT NULL by schema, but if out-of-contract
  // data ever carries a NULL it must stay JSON null (import then fails loudly)
  // rather than being coerced to the literal string "null" (silent corruption).
  const t = buildTelemetry([{ doc_id: "d1", session_id: null, accessed_at: 5 }], []);
  assert.equal(t.access_log[0].session_id, null);
  assert.notEqual(t.access_log[0].session_id, "null");
});

test("exportBundle writes manifest + jsonl files with source-of-truth counts", () => {
  const { dir, brainPath } = freshBrain();
  const bundleDir = join(dir, "bundle");
  const manifest = exportBundle({ brainPath, bundleDir });

  assert.equal(manifest.format, BUNDLE_FORMAT);
  assert.equal(manifest.brain_id, FIXTURE_BRAIN_ID);
  assert.deepEqual(manifest.counts, {
    documents: 4,
    memories: 1,
    chunks: 2,
    wiki: 1,
    links: 6,
    access_log: 3,
    search_misses: 2,
  });

  for (const f of ["manifest.json", "documents.jsonl", "links.jsonl", "telemetry.json"]) {
    assert.ok(existsSync(join(bundleDir, f)), `bundle missing ${f}`);
  }
  assert.equal(jsonl(join(bundleDir, "documents.jsonl")).length, 4);
  assert.equal(jsonl(join(bundleDir, "links.jsonl")).length, 6);
  const telemetry = JSON.parse(readFileSync(join(bundleDir, "telemetry.json"), "utf-8"));
  assert.equal(telemetry.access_log.length, 3);

  // The manifest on disk matches the returned one.
  assert.deepEqual(JSON.parse(readFileSync(join(bundleDir, "manifest.json"), "utf-8")), manifest);
});

test("export leaves the source db untouched (read-only open)", () => {
  const { dir, brainPath, dbPath } = freshBrain();
  const before = statSync(dbPath).mtimeMs;
  const sizeBefore = statSync(dbPath).size;
  exportBundle({ brainPath, bundleDir: join(dir, "bundle") });
  assert.equal(statSync(dbPath).mtimeMs, before, "export must not write to the brain db");
  assert.equal(statSync(dbPath).size, sizeBefore);
});

test("readBrainId prefers brain.json id and falls back to basename", () => {
  const { brainPath } = freshBrain();
  assert.equal(readBrainId(brainPath), FIXTURE_BRAIN_ID);
  const bare = mkdtempSync(join(tmpdir(), "wb-bare-brain-"));
  assert.equal(readBrainId(bare), bare.split(/[\\/]/).pop());
});

test("readBrainDb fails loud on missing or non-brain databases", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-notbrain-"));
  // Missing file: fileMustExist refuses to create one.
  assert.throws(() => readBrainDb(join(dir, "nope.db")));
  // Existing sqlite file that is not a brain index.
  const { default: Database } = await import("better-sqlite3");
  const p = join(dir, "empty.db");
  const db = new Database(p);
  db.exec("CREATE TABLE unrelated (x INTEGER)");
  db.close();
  assert.throws(() => readBrainDb(p), /not a brain index/);
});
