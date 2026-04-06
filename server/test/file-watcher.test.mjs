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

// Retry a check up to maxAttempts times with a delay between attempts.
// CI environments have unpredictable fs.watch latency.
async function waitFor(check, { maxAttempts = 10, delay = 500 } = {}) {
  for (let i = 0; i < maxAttempts; i++) {
    if (check()) return;
    await sleep(delay);
  }
  // Final check — let it throw if still failing
  assert.ok(check(), "waitFor timed out");
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

    await waitFor(() => {
      const result = db.search({ query: "watcher" });
      return result.results.length > 0;
    });

    const result = db.search({ query: "watcher" });
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
    await sleep(300);
    writeFileSync(filePath, "Updated content with unique keyword xyzzy");

    await waitFor(() => {
      const result = db.search({ query: "xyzzy" });
      return result.results.length > 0;
    });

    const result = db.search({ query: "xyzzy" });
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

  await sleep(300);
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

    await waitFor(() => {
      const after = db.search({ query: "deleted" });
      return after.results.length === 0;
    });
  } finally {
    watcher.stop();
    db.close();
    rmSync(brainPath, { recursive: true, force: true });
  }
});
