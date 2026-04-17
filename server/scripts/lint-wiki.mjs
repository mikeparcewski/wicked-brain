#!/usr/bin/env node
/**
 * Lint the contributor wiki.
 *
 * Reads `.wicked-brain/mode.json` (if present) to find the wiki root,
 * falls back to `docs/wiki/`. Walks the wiki, builds the canonical
 * registry, runs every rule from `lint-wiki.mjs`, and reports findings.
 *
 * Usage:
 *   node server/scripts/lint-wiki.mjs          # errors → exit 1
 *   node server/scripts/lint-wiki.mjs --strict # warnings also → exit 1
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWikiEntries, buildRegistry } from "../lib/canonical-registry.mjs";
import { runLintRules, formatFindings, lintExitCode } from "../lib/lint-wiki.mjs";
import { parseFrontmatter } from "../lib/frontmatter.mjs";
import { readModeFile } from "../lib/mode-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..", "..");

async function main() {
  const strict = process.argv.includes("--strict");

  const wikiRoot = await resolveWikiRoot();
  const wikiAbs = path.join(repoRoot, wikiRoot);

  const entries = await loadWikiEntries(wikiAbs);
  if (entries.length === 0) {
    console.error(`No wiki pages found under ${wikiRoot}.`);
    process.exit(1);
  }

  const registry = buildRegistry(entries);

  const pages = await loadPagesWithBodies(wikiAbs, entries);
  const knownPaths = await buildKnownPaths();

  const findings = runLintRules({ registry, pages, knownPaths });
  console.log(formatFindings(findings));
  process.exit(lintExitCode(findings, { strict }));
}

async function resolveWikiRoot() {
  const mode = await readModeFile(repoRoot).catch(() => null);
  if (mode?.wiki_root) return mode.wiki_root;
  // Convention fallback order from the discovery spec.
  for (const candidate of ["wiki", "docs/wiki", "docs"]) {
    try {
      const st = await fs.stat(path.join(repoRoot, candidate));
      if (st.isDirectory()) return candidate;
    } catch {
      // not present
    }
  }
  return "docs/wiki";
}

async function loadPagesWithBodies(wikiAbs, entries) {
  const pages = [];
  for (const e of entries) {
    const full = path.join(wikiAbs, e.path);
    const raw = await fs.readFile(full, "utf8");
    const { body } = parseFrontmatter(raw);
    const lineCount = body.split("\n").length;
    pages.push({ path: e.path, data: e.data, body, lineCount });
  }
  return pages;
}

/**
 * Collect a conservative set of repo paths that references can point at.
 * We walk the repo to one level deep from root plus the wiki tree itself,
 * capped to avoid blowup on large monorepos.
 */
async function buildKnownPaths() {
  const known = new Set();
  const cap = 5000;
  async function walk(relDir, depth) {
    if (known.size >= cap) return;
    if (depth > 4) return;
    let entries;
    try {
      entries = await fs.readdir(path.join(repoRoot, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (known.size >= cap) return;
      if (e.name.startsWith(".") && e.name !== ".github") continue;
      if (["node_modules", "dist", "build", "archive"].includes(e.name)) continue;
      const rel = path.posix.join(relDir, e.name);
      if (e.isFile()) {
        known.add(rel);
      } else if (e.isDirectory()) {
        known.add(rel);
        await walk(rel, depth + 1);
      }
    }
  }
  await walk("", 0);
  return known;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
