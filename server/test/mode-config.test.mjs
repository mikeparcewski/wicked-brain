import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readModeFile, writeModeFile, diffMode, validateMode, MODE_FILE_PATH } from "../lib/mode-config.mjs";

test("readModeFile: returns null when file missing", async () => {
  const tmp = await mkTmp();
  try {
    const r = await readModeFile(tmp);
    assert.equal(r, null);
  } finally {
    await rmTmp(tmp);
  }
});

test("readModeFile: throws on malformed JSON", async () => {
  const tmp = await mkTmp();
  try {
    await fs.mkdir(path.join(tmp, ".wicked-brain"));
    await fs.writeFile(path.join(tmp, MODE_FILE_PATH), "{ not json");
    await assert.rejects(() => readModeFile(tmp), /JSON/);
  } finally {
    await rmTmp(tmp);
  }
});

test("writeModeFile: creates .wicked-brain dir and writes file", async () => {
  const tmp = await mkTmp();
  try {
    const r = await writeModeFile(tmp, sampleDetection());
    assert.equal(r.written, true);
    const read = await readModeFile(tmp);
    assert.equal(read.mode, "code");
    assert.equal(read.wiki_root, "wiki");
    assert.equal(read.content_root, null);
    assert.equal(read.override, false);
    assert.equal(read.schema_version, 1);
    assert.ok(read.detected_at);
  } finally {
    await rmTmp(tmp);
  }
});

test("writeModeFile: write then read round-trips", async () => {
  const tmp = await mkTmp();
  try {
    const detection = {
      mode: "content",
      wiki_root: "wiki",
      content_root: "docs",
      score: { code: 3, content: 45 },
      reasons: ["+10 mkdocs.yml", "+20 prose_ratio=0.95"],
    };
    await writeModeFile(tmp, detection);
    const read = await readModeFile(tmp);
    assert.equal(read.mode, "content");
    assert.equal(read.content_root, "docs");
    assert.deepEqual(read.score, detection.score);
    assert.deepEqual(read.reasons, detection.reasons);
  } finally {
    await rmTmp(tmp);
  }
});

test("writeModeFile: override:true blocks overwrite by default", async () => {
  const tmp = await mkTmp();
  try {
    await writeModeFile(tmp, { ...sampleDetection(), mode: "content" }, { override: true });
    const attempt = await writeModeFile(tmp, sampleDetection()); // default override:false
    assert.equal(attempt.written, false);
    assert.match(attempt.reason, /override/);
    const read = await readModeFile(tmp);
    assert.equal(read.mode, "content", "existing mode preserved");
  } finally {
    await rmTmp(tmp);
  }
});

test("writeModeFile: override:true write replaces even an override-flagged file", async () => {
  const tmp = await mkTmp();
  try {
    await writeModeFile(tmp, { ...sampleDetection(), mode: "content" }, { override: true });
    const attempt = await writeModeFile(tmp, sampleDetection(), { override: true });
    assert.equal(attempt.written, true);
    const read = await readModeFile(tmp);
    assert.equal(read.mode, "code");
  } finally {
    await rmTmp(tmp);
  }
});

test("diffMode: no prior file reports change", () => {
  const d = diffMode(null, sampleDetection());
  assert.equal(d.changed, true);
});

test("diffMode: identical mode/wiki_root reports no change", () => {
  const det = sampleDetection();
  const existing = { mode: det.mode, wiki_root: det.wiki_root, content_root: det.content_root ?? null };
  const d = diffMode(existing, det);
  assert.equal(d.changed, false);
  assert.deepEqual(d.fields, []);
});

test("diffMode: mode change flagged", () => {
  const existing = { mode: "content", wiki_root: "wiki", content_root: "docs" };
  const det = { mode: "code", wiki_root: "wiki", content_root: null };
  const d = diffMode(existing, det);
  assert.equal(d.changed, true);
  assert.ok(d.fields.includes("mode"));
  assert.ok(d.fields.includes("content_root"));
});

test("validateMode: accepts a well-formed body", () => {
  const body = {
    schema_version: 1,
    mode: "code",
    wiki_root: "wiki",
    content_root: null,
    detected_at: "2026-04-17",
    override: false,
    score: { code: 35, content: 2 },
    reasons: [],
  };
  const r = validateMode(body);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test("validateMode: rejects bad schema_version", () => {
  const r = validateMode({ ...goodBody(), schema_version: 99 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("schema_version")));
});

test("validateMode: rejects unknown mode", () => {
  const r = validateMode({ ...goodBody(), mode: "banana" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("mode")));
});

test("validateMode: rejects non-date detected_at", () => {
  const r = validateMode({ ...goodBody(), detected_at: "yesterday" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("detected_at")));
});

test("validateMode: rejects non-boolean override", () => {
  const r = validateMode({ ...goodBody(), override: "true" });
  assert.equal(r.ok, false);
});

test("writeModeFile: throws on body that fails validation", async () => {
  // Force an invalid body by short-circuiting detection shape.
  const tmp = await mkTmp();
  try {
    await assert.rejects(
      () => writeModeFile(tmp, { mode: "banana", wiki_root: "wiki", score: { code: 0, content: 0 }, reasons: [] }),
      /invalid mode.json/,
    );
  } finally {
    await rmTmp(tmp);
  }
});

function goodBody() {
  return {
    schema_version: 1,
    mode: "code",
    wiki_root: "wiki",
    content_root: null,
    detected_at: "2026-04-17",
    override: false,
    score: { code: 35, content: 2 },
    reasons: [],
  };
}

function sampleDetection() {
  return {
    mode: "code",
    wiki_root: "wiki",
    content_root: null,
    score: { code: 35, content: 2 },
    reasons: ["+10 package.json", "+5 src/", "+20 code_ratio=0.95"],
  };
}

async function mkTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), "mode-config-test-"));
}

async function rmTmp(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}
