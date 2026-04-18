import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSchema,
  renderContractSchema,
  renderSchemaJson,
} from "../lib/gen-contract-schema.mjs";

const __filename = fileURLToPath(import.meta.url);
const serverLib = path.resolve(path.dirname(__filename), "..", "lib", "sqlite-search.mjs");

test("extractSchema: finds the documents table with expected columns", async () => {
  const src = await fs.readFile(serverLib, "utf8");
  const schema = extractSchema(src);
  const docs = schema.tables.find((t) => t.name === "documents");
  assert.ok(docs, "documents table present");
  const colNames = docs.columns.map((c) => c.name);
  for (const col of ["id", "path", "content", "frontmatter", "brain_id", "indexed_at", "content_hash", "canonical_for", "refs", "translation_of", "version_of"]) {
    assert.ok(colNames.includes(col), `missing column: ${col}`);
  }
});

test("extractSchema: includes canonical_ownership table", async () => {
  const src = await fs.readFile(serverLib, "utf8");
  const schema = extractSchema(src);
  const t = schema.tables.find((t) => t.name === "canonical_ownership");
  assert.ok(t, "canonical_ownership table present");
  const colNames = t.columns.map((c) => c.name);
  assert.ok(colNames.includes("canonical_id"));
  assert.ok(colNames.includes("doc_id"));
});

test("extractSchema: migrations include versions 1..6 in order with summaries", async () => {
  const src = await fs.readFile(serverLib, "utf8");
  const schema = extractSchema(src);
  const versions = schema.migrations.map((m) => m.version);
  assert.deepEqual(versions, [1, 2, 3, 4, 5, 6]);
  // v5 should mention translation/version columns.
  const m5 = schema.migrations.find((m) => m.version === 5);
  assert.ok(m5.summary.length > 0, "v5 summary should be captured");
  assert.ok(
    m5.ops.some((o) => o.includes("translation_of")) ||
      m5.ops.some((o) => o.includes("version_of")),
    "v5 ops should mention translation_of/version_of",
  );
  // v6 adds last_verified_at for wiki staleness detection.
  const m6 = schema.migrations.find((m) => m.version === 6);
  assert.ok(m6.summary.length > 0, "v6 summary should be captured");
  assert.ok(
    m6.ops.some((o) => o.includes("last_verified_at")),
    "v6 ops should mention last_verified_at",
  );
});

test("extractSchema: migration 4 ops include canonical_ownership creation", async () => {
  const src = await fs.readFile(serverLib, "utf8");
  const schema = extractSchema(src);
  const m4 = schema.migrations.find((m) => m.version === 4);
  assert.ok(m4.ops.some((o) => o.includes("canonical_ownership")), `got ops=${JSON.stringify(m4.ops)}`);
});

test("renderContractSchema: includes canonical_for and references frontmatter", async () => {
  const src = await fs.readFile(serverLib, "utf8");
  const schema = extractSchema(src);
  const md = renderContractSchema({
    ...schema,
    generatedAt: "2026-04-17",
    sourcePath: "server/lib/sqlite-search.mjs",
  });
  assert.ok(md.includes("canonical_for: [CONTRACT-SCHEMA]"));
  assert.ok(md.includes("references: [INV-MIGRATION-REQUIRED]"));
  assert.ok(md.includes("`documents`"));
  assert.ok(md.includes("## Migration ladder"));
});

test("renderSchemaJson: head_version matches last migration", async () => {
  const src = await fs.readFile(serverLib, "utf8");
  const schema = extractSchema(src);
  const json = renderSchemaJson({
    ...schema,
    generatedAt: "2026-04-17",
    sourcePath: "server/lib/sqlite-search.mjs",
  });
  assert.equal(json.head_version, schema.migrations.at(-1).version);
  assert.equal(json.canonical_id, "CONTRACT-SCHEMA");
});

test("extractSchema on synthetic source: balanced-brace migration parsing", () => {
  const src = `
    function foo() {
      // Migration 7: add bar column and index
      if (currentVersion < 7) {
        this.#db.exec(\`ALTER TABLE things ADD COLUMN bar TEXT\`);
        this.#db.exec(\`CREATE INDEX idx_things_bar ON things(bar)\`);
      }
    }
  `;
  const schema = extractSchema(src);
  assert.equal(schema.migrations.length, 1);
  assert.equal(schema.migrations[0].version, 7);
  assert.ok(schema.migrations[0].summary.includes("bar"));
  assert.ok(schema.migrations[0].ops.includes("ADD COLUMN things.bar"));
  assert.ok(schema.migrations[0].ops.includes("CREATE INDEX idx_things_bar ON things"));
});
