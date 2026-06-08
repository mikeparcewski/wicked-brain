import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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

test("survives an fs.watch 'error' event and degrades to polling instead of crashing", () => {
  const { brainPath, db } = makeBrain();
  // makeBrain creates chunks/ and wiki/; the watcher also watches memory/.
  mkdirSync(join(brainPath, "memory"), { recursive: true });

  const created = [];
  // Inject a fake watch so the FSWatcher 'error' event can be driven
  // deterministically — a real EMFILE depends on the OS file-descriptor limit.
  const fakeWatch = () => {
    const w = new EventEmitter();
    w.close = () => {};
    created.push(w);
    return w;
  };

  const watcher = new FileWatcher(brainPath, db, "test-brain", [], fakeWatch);
  watcher.start();

  try {
    assert.ok(watcher.watcherCount > 0, "fs watchers active before the error");
    assert.equal(watcher.polling, false, "not polling before the error");

    const emfile = Object.assign(
      new Error("EMFILE: too many open files, watch"),
      { code: "EMFILE" },
    );
    // Unhandled, this 'error' event is rethrown by Node and crashes the whole
    // server. The watcher must catch it and keep the process alive.
    assert.doesNotThrow(() => created[0].emit("error", emfile));

    assert.equal(watcher.watcherCount, 0, "fs watchers torn down after error");
    assert.equal(watcher.polling, true, "degraded to polling after error");
  } finally {
    watcher.stop();
    db.close();
    rmSync(brainPath, { recursive: true, force: true });
  }
});

test("degrades to polling when fs.watch throws EMFILE synchronously during init", () => {
  const { brainPath, db } = makeBrain();
  mkdirSync(join(brainPath, "memory"), { recursive: true });

  let calls = 0;
  // First dir attaches; the second throws EMFILE synchronously. Without the
  // resource-aware catch the first dir stays watched while the rest are left
  // neither watched nor polled — a silent half-watched state.
  const throwingWatch = () => {
    calls++;
    if (calls === 1) {
      const w = new EventEmitter();
      w.close = () => {};
      return w;
    }
    const err = new Error("EMFILE: too many open files, watch");
    err.code = "EMFILE";
    throw err;
  };

  const watcher = new FileWatcher(brainPath, db, "test-brain", [], throwingWatch);
  assert.doesNotThrow(() => watcher.start());

  try {
    assert.equal(watcher.watcherCount, 0, "partial fs watchers torn down");
    assert.equal(watcher.polling, true, "degraded to polling on sync EMFILE");
  } finally {
    watcher.stop();
    db.close();
    rmSync(brainPath, { recursive: true, force: true });
  }
});
