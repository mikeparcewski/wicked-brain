/**
 * codegraph-extractors/capability.mjs — agent/skill→capability injected edges.
 *
 * An agent (or, post-consolidation, a skill) declares needed capabilities via a
 * `tool-capabilities:` YAML frontmatter block list. This extractor reads those
 * declarations and creates synthetic `capability:<name>` nodes plus edges from the
 * declaring file to each capability.
 *
 * Two layouts are supported (backward-compatible):
 *   1. Legacy: agents/.../ markdown files with `tool-capabilities:` frontmatter.
 *   2. Consolidated skills layout (wicked-garden's agents→skills cleanup): the same
 *      `tool-capabilities:` frontmatter now lives in skills/.../SKILL.md files.
 *
 * Edge direction: source=agent/skill (dependent) → target=capability (dependency).
 * DEPENDENTS_BY="target": blastRadius(capability) = WHERE target=capability → source=file ✓
 *
 * Frontmatter-only port of wicked-garden's inject_capability_edges.py, extended for
 * the skills layout. No capability registry is imported — brain stays dependency-free.
 *
 * This extractor OWNS the capability nodes:
 *   - DELETE edges WHERE provenance='injected:capability'
 *   - DELETE nodes WHERE kind='capability'
 * then re-inserts cleanly on each run (fully idempotent).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ensureFileNode, ensureVirtualNode } from "../codegraph-nodes.mjs";

const INJECTED_PROVENANCE = "injected:capability";

// Matches the tool-capabilities: YAML block at the start or in frontmatter.
// Captures the multi-line list body (lines starting with optional whitespace + "- item").
const CAPS_BLOCK_RE = /(?:^|\n)tool-capabilities:\s*\n((?:[ \t]+-[ \t]*[a-z0-9_-]+[ \t]*\n?)+)/;

// Matches individual list items: "  - capability-name"
const ITEM_RE = /-[ \t]*([a-z0-9_-]+)/g;

/**
 * Extract the YAML frontmatter block (between leading --- fences) from text.
 * Returns the frontmatter string, or the full text if no fences found.
 * @param {string} text
 * @returns {string}
 */
function extractFrontmatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  return match ? match[1] : "";
}

/**
 * Parse tool-capabilities list from frontmatter text.
 * Returns a Set of capability names (deduped).
 * @param {string} frontmatter
 * @returns {Set<string>}
 */
function parseCapabilities(frontmatter) {
  const caps = new Set();
  const blockMatch = CAPS_BLOCK_RE.exec(frontmatter);
  if (!blockMatch) return caps;

  const block = blockMatch[1];
  ITEM_RE.lastIndex = 0;
  let m;
  while ((m = ITEM_RE.exec(block)) !== null) {
    caps.add(m[1]);
  }
  return caps;
}

/**
 * Recursively collect all .md files under dir.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectMdFiles(dir) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      results.push(...collectMdFiles(full));
    } else if (entry.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract agent→capability injected edges into the codegraph DB.
 *
 * @param {{ db: import("better-sqlite3").Database, sourcePath: string }} opts
 * @returns {{ edges_added: number, capabilities: number }}
 */
export function extract({ db, sourcePath }) {
  // 1. Idempotent: clear prior capability edges and owned nodes
  db.prepare("DELETE FROM edges WHERE provenance = ?").run(INJECTED_PROVENANCE);
  db.prepare("DELETE FROM nodes WHERE kind = 'capability'").run();

  const insertEdge = db.prepare(
    "INSERT INTO edges (source, target, kind, metadata, provenance) VALUES (?, ?, ?, ?, ?)"
  );

  let edges_added = 0;
  const distinctCaps = new Set();

  // 2. Scan both layouts: legacy agents/**/*.md and consolidated skills/**/SKILL.md.
  //    Dedup by relpath so a repo carrying both never double-counts a file.
  const agentFiles = collectMdFiles(join(sourcePath, "agents"));
  const skillFiles = collectMdFiles(join(sourcePath, "skills"))
    .filter((p) => p.split(sep).pop() === "SKILL.md");
  const seen = new Set();
  const declaringFiles = [];
  for (const absPath of [...agentFiles, ...skillFiles]) {
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    declaringFiles.push(absPath);
  }

  for (const absPath of declaringFiles) {
    let text;
    try { text = readFileSync(absPath, "utf8"); } catch { continue; }

    // Posix relpath relative to sourcePath
    const relpath = relative(sourcePath, absPath).split(sep).join("/");

    // 3. Parse frontmatter capabilities (deduped per agent)
    const frontmatter = extractFrontmatter(text);
    const caps = parseCapabilities(frontmatter);
    if (caps.size === 0) continue;

    const src = ensureFileNode(db, relpath);

    for (const cap of caps) {
      // Ensure the capability virtual node exists
      const tgt = ensureVirtualNode(db, `capability:${cap}`, "capability", cap);

      insertEdge.run(
        src,
        tgt,
        "references",
        JSON.stringify({ injected: "capability", capability: cap }),
        INJECTED_PROVENANCE
      );
      edges_added++;
      distinctCaps.add(cap);
    }
  }

  return { edges_added, capabilities: distinctCaps.size };
}
