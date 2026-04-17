import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  buildRegistry,
  findBrokenReferences,
  loadWikiEntries,
} from "../lib/canonical-registry.mjs";

test("buildRegistry: empty input yields empty registry", () => {
  const r = buildRegistry([]);
  assert.equal(r.byId.size, 0);
  assert.deepEqual(r.duplicates, []);
  assert.deepEqual(r.pages, []);
});

test("buildRegistry: single page claims multiple IDs", () => {
  const r = buildRegistry([
    { path: "wiki/invariants.md", data: { canonical_for: ["INV-A", "INV-B"] } },
  ]);
  assert.equal(r.byId.get("INV-A"), "wiki/invariants.md");
  assert.equal(r.byId.get("INV-B"), "wiki/invariants.md");
  assert.deepEqual(r.duplicates, []);
});

test("buildRegistry: duplicate claim flagged", () => {
  const r = buildRegistry([
    { path: "wiki/a.md", data: { canonical_for: ["INV-X"] } },
    { path: "wiki/b.md", data: { canonical_for: ["INV-X"] } },
  ]);
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].id, "INV-X");
  assert.deepEqual(r.duplicates[0].paths, ["wiki/a.md", "wiki/b.md"]);
});

test("buildRegistry: three-way duplicate lists all paths", () => {
  const r = buildRegistry([
    { path: "wiki/a.md", data: { canonical_for: ["X"] } },
    { path: "wiki/b.md", data: { canonical_for: ["X"] } },
    { path: "wiki/c.md", data: { canonical_for: ["X"] } },
  ]);
  assert.equal(r.duplicates[0].paths.length, 3);
});

test("buildRegistry: string value normalized to single-element array", () => {
  const r = buildRegistry([
    { path: "wiki/a.md", data: { canonical_for: "INV-ONLY" } },
  ]);
  assert.equal(r.byId.get("INV-ONLY"), "wiki/a.md");
});

test("buildRegistry: page with no canonical_for still tracked", () => {
  const r = buildRegistry([
    { path: "wiki/notes.md", data: { references: ["CLAUDE.md"] } },
  ]);
  assert.equal(r.pages.length, 1);
  assert.deepEqual(r.pages[0].canonical_for, []);
  assert.deepEqual(r.pages[0].references, ["CLAUDE.md"]);
});

test("buildRegistry: missing data field tolerated", () => {
  const r = buildRegistry([{ path: "wiki/x.md", data: null }]);
  assert.equal(r.pages.length, 1);
  assert.deepEqual(r.pages[0].canonical_for, []);
});

test("findBrokenReferences: resolves canonical ID refs", () => {
  const r = buildRegistry([
    { path: "wiki/inv.md", data: { canonical_for: ["INV-A"] } },
    { path: "wiki/extend.md", data: { references: ["INV-A"] } },
  ]);
  const broken = findBrokenReferences(r);
  assert.deepEqual(broken, []);
});

test("findBrokenReferences: resolves anchor-form refs", () => {
  const r = buildRegistry([
    { path: "wiki/inv.md", data: { canonical_for: ["INV-A"] } },
    { path: "wiki/extend.md", data: { references: ["wiki/inv.md#INV-A"] } },
  ]);
  const broken = findBrokenReferences(r);
  assert.deepEqual(broken, []);
});

test("findBrokenReferences: flags unresolved IDs", () => {
  const r = buildRegistry([
    { path: "wiki/extend.md", data: { references: ["INV-NONEXISTENT"] } },
  ]);
  const broken = findBrokenReferences(r);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].ref, "INV-NONEXISTENT");
});

test("findBrokenReferences: resolves refs to known paths", () => {
  const r = buildRegistry([
    { path: "wiki/extend.md", data: { references: ["CLAUDE.md"] } },
  ]);
  const broken = findBrokenReferences(r, new Set(["CLAUDE.md"]));
  assert.deepEqual(broken, []);
});

test("findBrokenReferences: resolves path+anchor when path is known", () => {
  const r = buildRegistry([
    { path: "wiki/extend.md", data: { references: ["CLAUDE.md#cross-platform"] } },
  ]);
  const broken = findBrokenReferences(r, new Set(["CLAUDE.md"]));
  assert.deepEqual(broken, []);
});

test("loadWikiEntries: walks a directory of .md files", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "canon-reg-test-"));
  try {
    await fs.writeFile(
      path.join(tmp, "invariants.md"),
      "---\ncanonical_for: [INV-A, INV-B]\n---\n\nbody",
    );
    await fs.mkdir(path.join(tmp, "sub"));
    await fs.writeFile(
      path.join(tmp, "sub", "extend.md"),
      "---\nreferences: [INV-A]\n---\n\nbody",
    );
    await fs.writeFile(path.join(tmp, "not-markdown.txt"), "ignored");

    const entries = await loadWikiEntries(tmp);
    assert.equal(entries.length, 2);
    const paths = entries.map((e) => e.path).sort();
    assert.deepEqual(paths, ["invariants.md", "sub/extend.md"]);
    const inv = entries.find((e) => e.path === "invariants.md");
    assert.deepEqual(inv.data.canonical_for, ["INV-A", "INV-B"]);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("loadWikiEntries + buildRegistry: integration over temp dir", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "canon-reg-int-"));
  try {
    await fs.writeFile(
      path.join(tmp, "invariants.md"),
      "---\ncanonical_for: [INV-PATH, INV-ESM]\n---\n",
    );
    await fs.writeFile(
      path.join(tmp, "extend-action.md"),
      "---\nreferences:\n  - INV-PATH\n  - INV-ESM\n---\n",
    );
    const entries = await loadWikiEntries(tmp);
    const reg = buildRegistry(entries);
    assert.equal(reg.byId.get("INV-PATH"), "invariants.md");
    assert.deepEqual(reg.duplicates, []);
    const broken = findBrokenReferences(reg);
    assert.deepEqual(broken, []);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
