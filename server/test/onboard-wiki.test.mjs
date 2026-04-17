import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runOnboardWiki, formatOnboardResult } from "../lib/onboard-wiki.mjs";
import { readModeFile } from "../lib/mode-config.mjs";

async function mkTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), "onboard-wiki-test-"));
}
async function rmTmp(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

test("runOnboardWiki: writes mode.json and stamps CLAUDE.md when present", async () => {
  const tmp = await mkTmp();
  try {
    // Make a synthetic code repo.
    await fs.writeFile(path.join(tmp, "package.json"), "{}");
    await fs.mkdir(path.join(tmp, "src"));
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, "src", `f${i}.mjs`), "");
    }
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "# Project\n\nNotes.\n");

    const result = await runOnboardWiki(tmp);
    assert.equal(result.detection.mode, "code");
    assert.equal(result.mode_write.action, "created");
    assert.equal(result.stamps.find((s) => s.file === "CLAUDE.md").action, "stamped");
    assert.equal(result.stamps.find((s) => s.file === "AGENTS.md").action, "absent");

    const written = await readModeFile(tmp);
    assert.equal(written.mode, "code");
    assert.equal(written.wiki_root, "wiki");

    const claudeMd = await fs.readFile(path.join(tmp, "CLAUDE.md"), "utf8");
    assert.ok(claudeMd.includes("Contributor wiki: ./wiki"));
  } finally {
    await rmTmp(tmp);
  }
});

test("runOnboardWiki: re-run is no-op on an already-stamped, unchanged repo", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "mkdocs.yml"), "site_name: test");
    await fs.mkdir(path.join(tmp, "content"));
    for (let i = 0; i < 10; i++) {
      await fs.writeFile(path.join(tmp, "content", `p${i}.md`), "# p");
    }
    await fs.writeFile(path.join(tmp, "AGENTS.md"), "# AGENTS\n\n");

    const first = await runOnboardWiki(tmp);
    assert.equal(first.mode_write.action, "created");
    assert.equal(first.stamps.find((s) => s.file === "AGENTS.md").action, "stamped");

    const second = await runOnboardWiki(tmp);
    // mode.json already matches detection → 'updated' action but content equivalent;
    // stamp should be 'already-current' because pointer hasn't moved.
    assert.equal(second.stamps.find((s) => s.file === "AGENTS.md").action, "already-current");
  } finally {
    await rmTmp(tmp);
  }
});

test("runOnboardWiki: respects override:true unless --force", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "package.json"), "{}");
    await fs.mkdir(path.join(tmp, "src"));
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, "src", `f${i}.mjs`), "");
    }
    await fs.mkdir(path.join(tmp, ".wicked-brain"));
    await fs.writeFile(
      path.join(tmp, ".wicked-brain", "mode.json"),
      JSON.stringify({
        schema_version: 1,
        mode: "content", // human says content
        wiki_root: "wiki",
        content_root: "content",
        detected_at: "2026-04-01",
        override: true,
      }, null, 2),
    );

    const soft = await runOnboardWiki(tmp);
    assert.equal(soft.mode_write.action, "skipped");
    // Still reports detection, but mode.json on disk preserves the override.
    const onDisk = await readModeFile(tmp);
    assert.equal(onDisk.mode, "content");

    const hard = await runOnboardWiki(tmp, { force: true });
    assert.equal(hard.mode_write.action, "updated");
    const afterForce = await readModeFile(tmp);
    assert.equal(afterForce.mode, "code"); // detection wins under --force
  } finally {
    await rmTmp(tmp);
  }
});

test("runOnboardWiki: does not create CLAUDE.md when absent", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "package.json"), "{}");
    await fs.mkdir(path.join(tmp, "src"));
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, "src", `f${i}.mjs`), "");
    }
    const result = await runOnboardWiki(tmp);
    assert.equal(result.stamps.find((s) => s.file === "CLAUDE.md").action, "absent");
    await assert.rejects(() => fs.stat(path.join(tmp, "CLAUDE.md")));
  } finally {
    await rmTmp(tmp);
  }
});

test("formatOnboardResult: surfaces mode + stamps", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "package.json"), "{}");
    await fs.mkdir(path.join(tmp, "src"));
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, "src", `f${i}.mjs`), "");
    }
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "# X\n");
    const result = await runOnboardWiki(tmp);
    const text = formatOnboardResult(result);
    assert.ok(text.includes("mode:       code"));
    assert.ok(text.includes("wiki_root:  wiki"));
    assert.ok(text.includes("CLAUDE.md"));
  } finally {
    await rmTmp(tmp);
  }
});
