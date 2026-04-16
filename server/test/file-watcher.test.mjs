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

async function waitFor(check, { maxAttempts = 20, delay = 500 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    if (check()) return;
    await sleep(delay);
  }
  assert.fail("waitFor timed out");
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
    await sleep(300); // let watcher attach before file operations
    writeFileSync(join(brainPath, "chunks", "extracted", "note1.md"), "Hello world from watcher test");

    await waitFor(() => db.search({ query: "watcher" }).results.length > 0);

    assert.equal(db.search({ query: "watcher" }).results[0].id, "chunks/extracted/note1.md");
  } finally {
    watcher.stop();
    db.close();
    rmSync(brainPath, { recursive: true, force: true });
  }
});

test("reindexes a .md file when modified", async () => {
  const { brainPath, db } = makeBrain();
  writeFileSync(join(brainPath, "wiki", "page.md"), "Initial content");

  const watcher = new FileWatcher(brainPath, db, "test-brain");
  watcher.start();

  try {
    await sleep(300);
    writeFileSync(join(brainPath, "wiki", "page.md"), "Updated content with unique keyword xyzzy");

    await waitFor(() => db.search({ query: "xyzzy" }).results.length > 0);

    assert.equal(db.search({ query: "xyzzy" }).results[0].id, "wiki/page.md");
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

  await sleep(300); // let watcher attach before file operations
  db.index({
    id: "wiki/todelete.md",
    path: "wiki/todelete.md",
    content: "Content that will be deleted",
    brain_id: "test-brain",
  });
  assert.ok(db.search({ query: "deleted" }).results.length > 0);

  try {
    unlinkSync(filePath);

    await waitFor(() => db.search({ query: "deleted" }).results.length === 0);
  } finally {
    watcher.stop();
    db.close();
    rmSync(brainPath, { recursive: true, force: true });
  }
});
