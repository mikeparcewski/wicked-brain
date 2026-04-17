import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { classifyRepo, detectRepoMode, defaultWikiRoots } from "../lib/detect-mode.mjs";

test("classifyRepo: code repo with package.json and src/", () => {
  const r = classifyRepo({
    manifests: ["package.json", "README.md"],
    dirs: ["src", "test"],
    codeFileCount: 80,
    proseFileCount: 2,
  });
  assert.equal(r.mode, "code");
  assert.ok(r.score.code >= 15);
  assert.ok(r.score.content < 10);
});

test("classifyRepo: content repo with mkdocs.yml and content/", () => {
  const r = classifyRepo({
    manifests: ["mkdocs.yml", "README.md"],
    dirs: ["content", "assets"],
    codeFileCount: 1,
    proseFileCount: 120,
  });
  assert.equal(r.mode, "content");
  assert.ok(r.score.content >= 15);
  assert.ok(r.score.code < 10);
});

test("classifyRepo: mixed repo with both manifests and balanced files", () => {
  const r = classifyRepo({
    manifests: ["package.json", "docusaurus.config.js"],
    dirs: ["src", "content"],
    codeFileCount: 40,
    proseFileCount: 40,
  });
  assert.equal(r.mode, "mixed");
  assert.ok(r.score.code >= 10);
  assert.ok(r.score.content >= 10);
});

test("classifyRepo: unknown for empty repo", () => {
  const r = classifyRepo({ manifests: [], dirs: [], codeFileCount: 0, proseFileCount: 0 });
  assert.equal(r.mode, "unknown");
});

test("classifyRepo: unknown for tiny repo below thresholds", () => {
  const r = classifyRepo({
    manifests: ["LICENSE"],
    dirs: ["misc"],
    codeFileCount: 1,
    proseFileCount: 1,
  });
  assert.equal(r.mode, "unknown");
});

test("classifyRepo: reasons are listed for each signal", () => {
  const r = classifyRepo({
    manifests: ["package.json"],
    dirs: ["src"],
    codeFileCount: 10,
    proseFileCount: 0,
  });
  assert.ok(r.reasons.some((x) => x.includes("package.json")));
  assert.ok(r.reasons.some((x) => x.includes("src/")));
  assert.ok(r.reasons.some((x) => x.includes("code_ratio")));
});

test("classifyRepo: content manifest alone is not enough", () => {
  // mkdocs.yml present (+10) but no dirs, no files → 10 vs 0 → content<15, unknown
  const r = classifyRepo({ manifests: ["mkdocs.yml"], dirs: [], codeFileCount: 0, proseFileCount: 0 });
  assert.equal(r.mode, "unknown");
});

test("classifyRepo: strong code manifest with some prose still classifies code", () => {
  const r = classifyRepo({
    manifests: ["Cargo.toml"],
    dirs: ["src"],
    codeFileCount: 30,
    proseFileCount: 3,
  });
  assert.equal(r.mode, "code");
});

test("defaultWikiRoots: content mode prefers existing docs/", () => {
  const roots = defaultWikiRoots({ mode: "content" }, { hasWikiDir: false, hasDocsWikiDir: false, hasDocsDir: true });
  assert.equal(roots.content_root, "docs");
  assert.equal(roots.wiki_root, "wiki");
});

test("defaultWikiRoots: content mode falls back to content/ when no docs/", () => {
  const roots = defaultWikiRoots({ mode: "content" }, { hasWikiDir: false, hasDocsWikiDir: false, hasDocsDir: false });
  assert.equal(roots.content_root, "content");
});

test("defaultWikiRoots: code mode sets content_root null", () => {
  const roots = defaultWikiRoots({ mode: "code" }, { hasWikiDir: false, hasDocsWikiDir: false, hasDocsDir: true });
  assert.equal(roots.content_root, null);
  assert.equal(roots.wiki_root, "wiki");
});

test("defaultWikiRoots: mixed mode sets both roots", () => {
  const roots = defaultWikiRoots({ mode: "mixed" }, { hasWikiDir: false, hasDocsWikiDir: false, hasDocsDir: true });
  assert.equal(roots.wiki_root, "wiki");
  assert.equal(roots.content_root, "docs");
});

test("defaultWikiRoots: existing wiki/ wins over docs/wiki/", () => {
  const roots = defaultWikiRoots({ mode: "code" }, { hasWikiDir: true, hasDocsWikiDir: true, hasDocsDir: true });
  assert.equal(roots.wiki_root, "wiki");
});

test("defaultWikiRoots: docs/wiki/ picked when wiki/ absent", () => {
  const roots = defaultWikiRoots({ mode: "code" }, { hasWikiDir: false, hasDocsWikiDir: true, hasDocsDir: true });
  assert.equal(roots.wiki_root, "docs/wiki");
});

test("defaultWikiRoots: mixed mode with docs/wiki/ nested", () => {
  const roots = defaultWikiRoots({ mode: "mixed" }, { hasWikiDir: false, hasDocsWikiDir: true, hasDocsDir: true });
  assert.equal(roots.wiki_root, "docs/wiki");
  assert.equal(roots.content_root, "docs");
});

test("detectRepoMode: classifies synthetic code repo", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "package.json"), "{}");
    await fs.mkdir(path.join(tmp, "src"));
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, "src", `f${i}.mjs`), "");
    }
    const r = await detectRepoMode(tmp);
    assert.equal(r.mode, "code");
    assert.equal(r.wiki_root, "wiki");
    assert.equal(r.content_root, null);
    assert.equal(r.scanned.capped, false);
  } finally {
    await rmTmp(tmp);
  }
});

test("detectRepoMode: picks docs/wiki as wiki_root when it pre-exists", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "package.json"), "{}");
    await fs.mkdir(path.join(tmp, "src"));
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, "src", `f${i}.mjs`), "");
    }
    await fs.mkdir(path.join(tmp, "docs", "wiki"), { recursive: true });
    const r = await detectRepoMode(tmp);
    assert.equal(r.wiki_root, "docs/wiki");
  } finally {
    await rmTmp(tmp);
  }
});

test("detectRepoMode: wiki/ takes priority over docs/wiki/ when both exist", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "package.json"), "{}");
    await fs.mkdir(path.join(tmp, "src"));
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(tmp, "src", `f${i}.mjs`), "");
    }
    await fs.mkdir(path.join(tmp, "wiki"));
    await fs.mkdir(path.join(tmp, "docs", "wiki"), { recursive: true });
    const r = await detectRepoMode(tmp);
    assert.equal(r.wiki_root, "wiki");
  } finally {
    await rmTmp(tmp);
  }
});

test("detectRepoMode: classifies synthetic content repo", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "mkdocs.yml"), "site_name: test");
    await fs.mkdir(path.join(tmp, "content"));
    for (let i = 0; i < 10; i++) {
      await fs.writeFile(path.join(tmp, "content", `p${i}.md`), "# page");
    }
    const r = await detectRepoMode(tmp);
    assert.equal(r.mode, "content");
    assert.equal(r.content_root, "content");
  } finally {
    await rmTmp(tmp);
  }
});

test("detectRepoMode: skips node_modules and .git", async () => {
  const tmp = await mkTmp();
  try {
    await fs.writeFile(path.join(tmp, "package.json"), "{}");
    await fs.mkdir(path.join(tmp, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".git"));
    for (let i = 0; i < 50; i++) {
      await fs.writeFile(path.join(tmp, "node_modules", "pkg", `x${i}.js`), "");
    }
    await fs.writeFile(path.join(tmp, ".git", "HEAD"), "ref: refs/heads/main");
    const r = await detectRepoMode(tmp);
    // Only the manifest counts; node_modules/.git walked over → low file count
    assert.ok(r.scanned.files < 5, `expected few files scanned, got ${r.scanned.files}`);
  } finally {
    await rmTmp(tmp);
  }
});

test("detectRepoMode: caps file walk at maxFiles", async () => {
  const tmp = await mkTmp();
  try {
    await fs.mkdir(path.join(tmp, "src"));
    for (let i = 0; i < 60; i++) {
      await fs.writeFile(path.join(tmp, "src", `f${i}.js`), "");
    }
    const r = await detectRepoMode(tmp, { maxFiles: 20 });
    assert.equal(r.scanned.capped, true);
    assert.ok(r.scanned.files <= 20);
  } finally {
    await rmTmp(tmp);
  }
});

test("detectRepoMode: missing directory returns unknown", async () => {
  const r = await detectRepoMode("/nonexistent/path/that/does/not/exist");
  assert.equal(r.mode, "unknown");
});

async function mkTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), "detect-mode-test-"));
}

async function rmTmp(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}
