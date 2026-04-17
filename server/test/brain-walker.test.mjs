import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { walkBrainContent, purgeBrainContent } from "../lib/brain-walker.mjs";

async function mkTmpBrain() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "brain-walker-"));
  for (const d of ["chunks/extracted", "chunks/inferred", "wiki/projects", "memory", "_meta", "raw"]) {
    await fs.mkdir(path.join(tmp, d), { recursive: true });
  }
  return tmp;
}

async function rmTmp(dir) { await fs.rm(dir, { recursive: true, force: true }); }

test("walkBrainContent: picks up chunks / wiki / memory markdown", async () => {
  const tmp = await mkTmpBrain();
  try {
    await fs.writeFile(path.join(tmp, "chunks/extracted/a.md"), "a");
    await fs.writeFile(path.join(tmp, "chunks/inferred/b.md"), "b");
    await fs.writeFile(path.join(tmp, "wiki/projects/c.md"), "c");
    await fs.writeFile(path.join(tmp, "memory/d.md"), "d");
    // Noise that must be skipped.
    await fs.writeFile(path.join(tmp, "_meta/config.json"), "{}");
    await fs.writeFile(path.join(tmp, "raw/notes.txt"), "x");
    await fs.writeFile(path.join(tmp, "chunks/extracted/ignore.json"), "{}");
    const results = await walkBrainContent(tmp);
    const rels = results.map((r) => r.rel);
    assert.deepEqual(rels, [
      "chunks/extracted/a.md",
      "chunks/inferred/b.md",
      "memory/d.md",
      "wiki/projects/c.md",
    ]);
  } finally {
    await rmTmp(tmp);
  }
});

test("walkBrainContent: skips dotfiles and dotdirs", async () => {
  const tmp = await mkTmpBrain();
  try {
    await fs.writeFile(path.join(tmp, "chunks/extracted/.hidden.md"), "x");
    await fs.mkdir(path.join(tmp, "wiki/.drafts"));
    await fs.writeFile(path.join(tmp, "wiki/.drafts/sneaky.md"), "x");
    const results = await walkBrainContent(tmp);
    assert.equal(results.length, 0);
  } finally {
    await rmTmp(tmp);
  }
});

test("purgeBrainContent: removes content files, recreates empty dirs", async () => {
  const tmp = await mkTmpBrain();
  try {
    await fs.writeFile(path.join(tmp, "chunks/extracted/a.md"), "a");
    await fs.writeFile(path.join(tmp, "wiki/projects/c.md"), "c");
    await fs.writeFile(path.join(tmp, "memory/d.md"), "d");
    const counts = await purgeBrainContent(tmp);
    assert.deepEqual(counts, { chunks: 1, wiki: 1, memory: 1 });
    // Content files gone.
    const after = await walkBrainContent(tmp);
    assert.equal(after.length, 0);
    // Directories preserved with .gitkeep.
    for (const d of ["chunks", "wiki", "memory"]) {
      const st = await fs.stat(path.join(tmp, d));
      assert.ok(st.isDirectory(), `${d} should remain`);
    }
  } finally {
    await rmTmp(tmp);
  }
});

test("purgeBrainContent: does not touch _meta or raw", async () => {
  const tmp = await mkTmpBrain();
  try {
    await fs.writeFile(path.join(tmp, "_meta/config.json"), "{}");
    await fs.writeFile(path.join(tmp, "raw/original.txt"), "important");
    await purgeBrainContent(tmp);
    assert.ok((await fs.readFile(path.join(tmp, "_meta/config.json"), "utf8")) === "{}");
    assert.ok((await fs.readFile(path.join(tmp, "raw/original.txt"), "utf8")) === "important");
  } finally {
    await rmTmp(tmp);
  }
});
