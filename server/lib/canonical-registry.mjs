import fs from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";

/**
 * Canonical registry: maps canonical IDs (e.g. "INV-PATHS-FORWARD") to the
 * single page that owns them. Detects violations of the "one page per ID"
 * rule and broken references.
 *
 * The registry is built once from a list of pages (each with frontmatter
 * data) and is cheap to query. It does not touch the DB — it is a pure
 * map-building function. Persistence and search integration live in
 * sqlite-search.
 */

/**
 * Build a registry from an array of { path, data } entries where `data`
 * comes from parseFrontmatter.
 *
 * Returns:
 *   {
 *     byId: Map<id, path>          canonical pages (first claimant wins)
 *     duplicates: Array<{ id, paths: string[] }>
 *     pages: Array<{ path, canonical_for: string[], references: string[] }>
 *   }
 */
export function buildRegistry(entries) {
  const byId = new Map();
  const duplicateHits = new Map(); // id -> Set of paths
  const pages = [];

  for (const { path: p, data } of entries) {
    const claimed = normalizeList(data?.canonical_for);
    const refs = normalizeList(data?.references);
    pages.push({ path: p, canonical_for: claimed, references: refs });

    for (const id of claimed) {
      if (byId.has(id)) {
        if (!duplicateHits.has(id)) {
          duplicateHits.set(id, new Set([byId.get(id)]));
        }
        duplicateHits.get(id).add(p);
      } else {
        byId.set(id, p);
      }
    }
  }

  const duplicates = [];
  for (const [id, pathSet] of duplicateHits) {
    duplicates.push({ id, paths: [...pathSet].sort() });
  }
  duplicates.sort((a, b) => a.id.localeCompare(b.id));

  return { byId, duplicates, pages };
}

/**
 * Find references that don't resolve.
 *
 * A reference is resolvable if:
 *   - it matches a canonical ID in the registry
 *   - OR it matches a known path (present in `knownPaths`)
 *   - OR it is an anchor-style link to a canonical ID (e.g. "wiki/invariants.md#INV-A")
 *
 * Returns Array<{ page, ref, reason }>.
 */
export function findBrokenReferences(registry, knownPaths = new Set()) {
  const broken = [];
  const canonicalIds = new Set(registry.byId.keys());
  for (const page of registry.pages) {
    for (const ref of page.references) {
      if (isResolvable(ref, canonicalIds, knownPaths)) continue;
      broken.push({ page: page.path, ref, reason: "unresolved reference" });
    }
  }
  return broken;
}

/**
 * Walk a wiki root and load every .md file's frontmatter.
 * Returns entries ready for buildRegistry.
 */
export async function loadWikiEntries(wikiRoot) {
  const entries = [];
  await walkMarkdown(wikiRoot, wikiRoot, entries);
  return entries;
}

async function walkMarkdown(absRoot, absDir, out) {
  let items;
  try {
    items = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of items) {
    const abs = path.join(absDir, item.name);
    if (item.isDirectory()) {
      await walkMarkdown(absRoot, abs, out);
    } else if (item.isFile() && item.name.endsWith(".md")) {
      const content = await fs.readFile(abs, "utf8");
      const { data } = parseFrontmatter(content);
      const rel = path.relative(absRoot, abs).replace(/\\/g, "/");
      out.push({ path: rel, data });
    }
  }
}

function normalizeList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

function isResolvable(ref, canonicalIds, knownPaths) {
  if (canonicalIds.has(ref)) return true;
  const hashIdx = ref.indexOf("#");
  if (hashIdx >= 0) {
    const anchorId = ref.slice(hashIdx + 1);
    if (canonicalIds.has(anchorId)) return true;
    const pathPart = ref.slice(0, hashIdx);
    if (pathPart.length > 0 && knownPaths.has(pathPart)) return true;
  }
  if (knownPaths.has(ref)) return true;
  return false;
}
