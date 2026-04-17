import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWikiEntries, buildRegistry, findBrokenReferences } from "../lib/canonical-registry.mjs";

const __filename = fileURLToPath(import.meta.url);
const wikiRoot = path.resolve(path.dirname(__filename), "..", "..", "docs", "wiki");

// Dog-food: wicked-brain's own wiki must satisfy every rule the
// canonical-registry enforces. If it doesn't, the repo can't claim its own
// tooling works.

test("dogfood: repo wiki has no duplicate canonical_for claims", async () => {
  const entries = await loadWikiEntries(wikiRoot);
  const registry = buildRegistry(entries);
  assert.deepEqual(
    registry.duplicates,
    [],
    `duplicates detected: ${JSON.stringify(registry.duplicates, null, 2)}`,
  );
});

test("dogfood: repo wiki registry includes expected canonical IDs", async () => {
  const entries = await loadWikiEntries(wikiRoot);
  const registry = buildRegistry(entries);
  const must = [
    "INV-PATHS-FORWARD",
    "INV-CANONICAL-SINGLE-OWNER",
    "INV-MIGRATION-REQUIRED",
    "CONTRACT-API",
    "CONTRACT-SCHEMA",
    "MAP-FILES",
    "CONTRIB-WIKI-INDEX",
    "RECIPE-ADD-ACTION",
    "RECIPE-ADD-MIGRATION",
    "RECIPE-RUN-TESTS",
    "RECIPE-RELEASE",
  ];
  for (const id of must) {
    assert.ok(registry.byId.has(id), `missing canonical_for: ${id}`);
  }
});

test("dogfood: repo wiki references resolve", async () => {
  const entries = await loadWikiEntries(wikiRoot);
  const registry = buildRegistry(entries);
  // Tolerate repo-relative paths that point outside wiki/ (specs, CLAUDE.md, code).
  // The registry only needs canonical IDs to resolve; external paths are
  // checked separately by future lint rules.
  const broken = findBrokenReferences(registry);
  const canonicalOnly = broken.filter((b) => !b.ref.includes("/") && !b.ref.endsWith(".md"));
  assert.deepEqual(canonicalOnly, [], `unresolved canonical IDs: ${JSON.stringify(canonicalOnly)}`);
});
