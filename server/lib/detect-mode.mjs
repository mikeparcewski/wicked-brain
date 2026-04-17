import fs from "node:fs/promises";
import path from "node:path";

const CODE_MANIFESTS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  "mix.exs",
  "deno.json",
  "bun.lockb",
];

const CONTENT_MANIFESTS = [
  "mkdocs.yml",
  "mkdocs.yaml",
  "_config.yml",
  "hugo.toml",
  "hugo.yaml",
  "book.toml",
  "docusaurus.config.js",
  "docusaurus.config.ts",
  "docusaurus.config.mjs",
  "astro.config.mjs",
  "astro.config.ts",
  ".vitepress",
  "antora.yml",
];

const CODE_DIRS = ["src", "lib", "server", "cmd", "internal", "pkg", "app"];
const CONTENT_DIRS = ["content", "posts", "chapters", "handbook", "policies", "articles"];

const CODE_EXTS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".pyi",
  ".go", ".rs",
  ".java", ".kt", ".kts", ".scala", ".groovy",
  ".rb", ".php", ".ex", ".exs",
  ".c", ".h", ".cpp", ".hpp", ".cc", ".cxx",
  ".cs", ".fs", ".vb",
  ".swift", ".m", ".mm",
  ".sh", ".bash", ".zsh", ".fish",
  ".lua", ".r",
]);

const PROSE_EXTS = new Set([
  ".md", ".mdx", ".markdown",
  ".adoc", ".asciidoc",
  ".rst",
  ".txt",
  ".tex",
  ".org",
]);

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out",
  ".venv", "venv", "env", "__pycache__",
  ".next", ".nuxt", ".svelte-kit", ".cache",
  "target", "bin", "obj",
  "archive", "vendor",
  ".wicked-brain",
]);

/**
 * Pure classifier. Takes shallow scan inputs, returns mode verdict.
 */
export function classifyRepo({ manifests = [], dirs = [], codeFileCount = 0, proseFileCount = 0 }) {
  let codeScore = 0;
  let contentScore = 0;
  const reasons = [];

  for (const m of manifests) {
    if (CODE_MANIFESTS.includes(m)) {
      codeScore += 10;
      reasons.push(`+10 code manifest: ${m}`);
    }
    if (CONTENT_MANIFESTS.includes(m)) {
      contentScore += 10;
      reasons.push(`+10 content manifest: ${m}`);
    }
  }

  for (const d of dirs) {
    if (CODE_DIRS.includes(d)) {
      codeScore += 5;
      reasons.push(`+5 code dir: ${d}/`);
    }
    if (CONTENT_DIRS.includes(d)) {
      contentScore += 5;
      reasons.push(`+5 content dir: ${d}/`);
    }
  }

  const total = codeFileCount + proseFileCount;
  const MIN_SAMPLE = 5;
  if (total >= MIN_SAMPLE) {
    const codeRatio = codeFileCount / total;
    const proseRatio = proseFileCount / total;
    const codeBoost = Math.round(codeRatio * 20);
    const contentBoost = Math.round(proseRatio * 20);
    if (codeBoost > 0) {
      codeScore += codeBoost;
      reasons.push(`+${codeBoost} code_ratio=${codeRatio.toFixed(2)} (${codeFileCount}/${total})`);
    }
    if (contentBoost > 0) {
      contentScore += contentBoost;
      reasons.push(`+${contentBoost} prose_ratio=${proseRatio.toFixed(2)} (${proseFileCount}/${total})`);
    }
  } else if (total > 0) {
    reasons.push(`ratio skipped: sample too small (${total} < ${MIN_SAMPLE})`);
  }

  let mode;
  if (codeScore >= 15 && contentScore < 10) mode = "code";
  else if (contentScore >= 15 && codeScore < 10) mode = "content";
  else if (codeScore >= 10 && contentScore >= 10) mode = "mixed";
  else mode = "unknown";

  return {
    mode,
    score: { code: codeScore, content: contentScore },
    reasons,
  };
}

/**
 * Default paths for the wiki root, given a detection result.
 *
 * Honors the discovery contract's convention-fallback order for an already-
 * present wiki tree: `wiki/` → `docs/wiki/` → default `wiki/`. That way a
 * repo that already has `docs/wiki/` (common when `docs/` is contributor-
 * facing) is detected correctly and mode.json points at the right place.
 */
export function defaultWikiRoots({ mode }, { hasWikiDir, hasDocsWikiDir, hasDocsDir }) {
  const wikiRoot = hasWikiDir
    ? "wiki"
    : hasDocsWikiDir
      ? "docs/wiki"
      : "wiki";
  if (mode === "mixed") {
    return {
      wiki_root: wikiRoot,
      content_root: hasDocsDir ? "docs" : "content",
    };
  }
  if (mode === "content") {
    return {
      wiki_root: wikiRoot,
      content_root: hasDocsDir ? "docs" : "content",
    };
  }
  return {
    wiki_root: wikiRoot,
    content_root: null,
  };
}

/**
 * I/O wrapper: scans a repo root with caps, then classifies.
 */
export async function detectRepoMode(repoRoot, { maxFiles = 10000, maxDepth = 6 } = {}) {
  const absRoot = path.resolve(repoRoot);
  const topLevel = await readDirSafe(absRoot);

  const manifests = topLevel.filter((e) => e.isFile).map((e) => e.name);
  const dirs = topLevel.filter((e) => e.isDir && !SKIP_DIRS.has(e.name)).map((e) => e.name);

  let codeFileCount = 0;
  let proseFileCount = 0;
  let visited = 0;
  const queue = dirs.map((d) => ({ rel: d, depth: 1 }));

  while (queue.length > 0 && visited < maxFiles) {
    const { rel, depth } = queue.shift();
    if (depth > maxDepth) continue;
    const abs = path.join(absRoot, rel);
    const entries = await readDirSafe(abs);
    for (const e of entries) {
      if (visited >= maxFiles) break;
      if (e.isDir) {
        if (SKIP_DIRS.has(e.name)) continue;
        queue.push({ rel: path.join(rel, e.name), depth: depth + 1 });
      } else if (e.isFile) {
        visited += 1;
        const ext = path.extname(e.name).toLowerCase();
        if (CODE_EXTS.has(ext)) codeFileCount += 1;
        else if (PROSE_EXTS.has(ext)) proseFileCount += 1;
      }
    }
  }

  const result = classifyRepo({ manifests, dirs, codeFileCount, proseFileCount });
  const hasWikiDir = dirs.includes("wiki");
  const hasDocsDir = dirs.includes("docs");
  // Check for a pre-existing `docs/wiki/` tree — this is the "contributor-
  // facing docs/" case where the wiki has been nested by convention.
  let hasDocsWikiDir = false;
  if (hasDocsDir) {
    try {
      const docsEntries = await fs.readdir(path.join(absRoot, "docs"), { withFileTypes: true });
      hasDocsWikiDir = docsEntries.some((e) => e.isDirectory() && e.name === "wiki");
    } catch {
      // directory unreadable — treat as absent
    }
  }
  const roots = defaultWikiRoots(result, { hasWikiDir, hasDocsWikiDir, hasDocsDir });

  return {
    ...result,
    ...roots,
    scanned: { files: visited, capped: visited >= maxFiles },
  };
}

async function readDirSafe(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      isFile: e.isFile(),
    }));
  } catch {
    return [];
  }
}
