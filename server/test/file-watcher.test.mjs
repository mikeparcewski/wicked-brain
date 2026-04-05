import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteSearch } from "../lib/sqlite-search.mjs";
import { FileWatcher } from "../lib/file-watcher.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeBrain() {
  const brainPath = mkdtempSync(join(tmpdir(), "fs-brain-test-"));
  mkdirSync(join(brainPath, "chunks", "extracted"), { recursive: true });
  mkdirSync(join(brainPath, "wiki"), { recursive: true });
  const db = new SqliteSearch(":memory:", "test-brain");
  return { brainPath, db };
}

test("indexes a new .md file when written", async () => {
  const { brainPath, db } = makeBrain();
  const watcher = new FileWatcher(brainPath, db, "test-brain");
  watcher.start();

  try {
    const filePath = join(brainPath, "chunks", "extracted", "note1.md");
    writeFileSync(filePath, "Hello world from watcher test");

    await sleep(1000);

    const result = db.search({ query: "watcher" });
    assert.ok(result.results.length > 0, "Expected indexed document to be found");
    assert.equal(result.results[0].id, "chunks/extracted/note1.md");
  } finally {
    watcher.stop();
    db.close();
    rmSync(brainPath, { recursive: true, force: true });
  }
});

test("reindexes a .md file when modified", async () => {
  const { brainPath, db } = makeBrain();
  const filePath = join(brainPath, "wiki", "page.md");
  writeFileSync(filePath, "Initial content");

  const watcher = new FileWatcher(brainPath, db, "test-brain");
  watcher.start();

  try {
    // Modify the file after watcher starts
    await sleep(200);
    writeFileSync(filePath, "Updated content with unique keyword xyzzy");

    await sleep(1000);

    const result = db.search({ query: "xyzzy" });
    assert.ok(result.results.length > 0, "Expected reindexed document with updated content");
    assert.equal(result.results[0].id, "wiki/page.md");
  } finally {
    watcher.stop();
    db.close();
    rmSync(brainPath, { recursive: true, force: true });
  }
});

test("removes a .md file from index when deleted", async () => {
  const { brainPath, db } = makeBrain();
  const filePath = join(brainPath, "wiki", "todelete.md");
  writeFileSync(filePath, "Content that will be deleted");

  const watcher = new FileWatcher(brainPath, db, "test-brain");
  watcher.start();

  // First index the file via a write trigger
  await sleep(200);
  // Force it into the index directly so we know it's there
  db.index({
    id: "wiki/todelete.md",
    path: "wiki/todelete.md",
    content: "Content that will be deleted",
    brain_id: "test-brain",
  });

  const before = db.search({ query: "deleted" });
  assert.ok(before.results.length > 0, "Document should be indexed before deletion");

  try {
    unlinkSync(filePath);
    await sleep(1000);

    const after = db.search({ query: "deleted" });
    assert.equal(after.results.length, 0, "Document should be removed from index after file deletion");
  } finally {
    watcher.stop();
    db.close();
    rmSync(brainPath, { recursive: true, force: true });
  }
});
