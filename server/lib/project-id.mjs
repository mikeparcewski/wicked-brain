/**
 * Canonical project-id slug + per-project brain resolution.
 *
 * ONE convention, shared by the call CLI, the server-path resolver, and the
 * init/status/migrate skills, so a single repo always maps to the same brain
 * directory. Before this module the call CLI keyed brains on the RAW cwd
 * basename (underscore preserved) while the init skill kebab-cased the id — so
 * `command_iq` (path) and `command-iq` (init) diverged and one repo's memory
 * fragmented across sibling stores (see wicked-brain#56).
 *
 * Canonical convention: **kebab-case** — lowercase, non-alphanumerics collapse
 * to a single hyphen, trimmed. It matches `slugify()` in memory-promoter (used
 * for memory titles), is the documented/intended id in the init skill, and is
 * filesystem-safe on macOS, Linux, and Windows. Underscores and spaces fold to
 * hyphens; `command_iq` → `command-iq`.
 *
 * Pure module — no fs, no I/O. `resolvePerProjectBrain` takes fs probes as
 * callbacks so it stays testable and cross-platform (forward slashes only).
 *
 * @module lib/project-id
 */

import { createHash } from "node:crypto";

/**
 * Extract the trailing path segment from a cwd or bare name, tolerating both
 * `/` and `\\` separators so callers can pass `process.cwd()` on any OS.
 */
export function baseName(input) {
  const s = String(input || "").replace(/\\/g, "/").replace(/\/+$/g, "");
  const idx = s.lastIndexOf("/");
  return idx === -1 ? s : s.slice(idx + 1);
}

/**
 * Kebab-case a bare name into a canonical, filesystem-safe slug.
 * Unicode is folded toward ASCII via NFKD (é → e); any name that folds away to
 * nothing (e.g. all-CJK) falls back to a short, deterministic hash of the
 * original so two distinct names never collapse to the same empty slug.
 */
// Combining diacritical marks (U+0300–U+036F). NFKD splits `é` into `e` + one
// of these; dropping them folds the accent away instead of turning it into a
// stray hyphen. Built via RegExp() so no literal combining chars sit in source.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function slugifyId(text) {
  const raw = String(text || "");
  const slug = raw
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug) return slug;
  // Nothing survived slugification — keep it deterministic and collision-free.
  return "brain-" + createHash("sha1").update(raw).digest("hex").slice(0, 8);
}

/**
 * Canonical project id for a working directory (or bare project name).
 * `projectId('/Users/me/Projects/command_iq')` → `'command-iq'`.
 */
export function projectId(input) {
  return slugifyId(baseName(input));
}

/**
 * Resolve the per-project brain directory for a cwd, canonicalizing the slug and
 * detecting legacy raw-basename fragmentation. Pure: the caller supplies the fs
 * probes so this is testable without touching disk and stays cross-platform.
 *
 * Least-surprising, no-data-loss policy (wicked-brain#56):
 *  - Fresh repo (no store yet)     → canonical dir. New brains are always canonical.
 *  - Only the canonical store      → canonical dir.
 *  - Only a legacy raw-basename    → serve the legacy store transparently (the
 *    store exists              user's existing brain keeps working) + warn to migrate.
 *  - BOTH exist (a true split)     → prefer the POPULATED store; never silently
 *                                    serve an empty brain while a populated
 *                                    sibling holds the data. Tie-break to
 *                                    canonical. Always warn with the merge path.
 *
 * Case-insensitive filesystems (macOS APFS default, Windows): the legacy raw
 * basename and the canonical kebab slug can be distinct *strings* that name the
 * SAME physical directory (e.g. `MyRepo` vs `myrepo`). That is one store, not a
 * split — `sameDir` lets the caller detect it (realpath/inode compare) so a
 * case-only variant never reads as a fragmented brain.
 *
 * "Populated" is decided by real data, not just a built index: a store counts as
 * populated if it has a `.brain.db` (`hasIndex`) OR on-disk content such as
 * `memory/*.md` or raw/chunk files (`hasContent`). So a freshly-created legacy
 * store whose index hasn't been built yet still wins over an empty canonical.
 *
 * @param {object} o
 * @param {string} o.cwd            working directory (any OS separators)
 * @param {string} o.projectsRoot   e.g. `~/.wicked-brain/projects`
 * @param {(dir:string)=>boolean} o.storeExists  true if `dir` is an initialized brain
 * @param {(dir:string)=>boolean} o.hasIndex     true if `dir` has a built `.brain.db`
 * @param {(dir:string)=>boolean} [o.hasContent] true if `dir` holds on-disk content
 *   (memory/*.md, raw/chunks) even without a built index. Defaults to always-false
 *   (index-only) so callers that don't probe content keep the old behavior.
 * @param {(a:string,b:string)=>boolean} [o.sameDir] true if two paths refer to the
 *   SAME underlying directory (case-insensitive FS guard). Defaults to never-same.
 * @param {(a:string,b:string)=>string} o.joinPath  path join (defaults to `a/b`)
 * @returns {{ path:string, canonicalId:string, legacyId:string,
 *             canonicalDir:string, legacyDir:string, collision:boolean,
 *             warning:(string|null) }}
 */
export function resolvePerProjectBrain({
  cwd,
  projectsRoot,
  storeExists,
  hasIndex,
  hasContent = () => false,
  sameDir = () => false,
  joinPath = (a, b) => `${a}/${b}`,
}) {
  const canonicalId = projectId(cwd);
  const legacyId = baseName(cwd);
  const canonicalDir = joinPath(projectsRoot, canonicalId);
  const legacyDir = joinPath(projectsRoot, legacyId);

  // The legacy raw basename only diverges when it isn't already canonical.
  const split = !!legacyId && legacyId !== canonicalId;
  const canonExists = storeExists(canonicalDir);
  let legacyExists = split && storeExists(legacyDir);

  // Case-insensitive FS guard: when BOTH paths appear to exist, they may in fact
  // be the same physical directory reached through two case/format variants of
  // the name. If so it's a single store — collapse to the canonical path instead
  // of reporting a false split. Only probe when both look present (avoids
  // realpath-on-missing throws) and never against a genuinely distinct dir
  // (e.g. `command_iq` vs `command-iq`, which realpath to different inodes).
  if (legacyExists && canonExists && sameDir(canonicalDir, legacyDir)) {
    legacyExists = false;
  }

  const base = { canonicalId, legacyId, canonicalDir, legacyDir };

  // No divergence, or the legacy dir isn't an initialized brain: canonical path.
  if (!legacyExists) {
    return { ...base, path: canonicalDir, collision: false, warning: null };
  }

  const mergeCmd =
    `wicked-brain:migrate (merge legacy "${legacyId}" into canonical "${canonicalId}")`;

  if (!canonExists) {
    // Only the legacy raw-basename store is initialized. Serve it so the user's
    // existing brain keeps working, but tell them to move it to the canonical id.
    return {
      ...base,
      path: legacyDir,
      collision: false,
      warning:
        `brain for this repo lives under the legacy id "${legacyId}"; the ` +
        `canonical id is "${canonicalId}". Serving the legacy store. ` +
        `Run ${mergeCmd} to reconcile.`,
    };
  }

  // Both stores exist — a true split brain. Prefer whichever actually holds
  // data so we never serve an empty/degraded brain while a populated sibling
  // sits unused. "Populated" = a built index OR on-disk content (memory/*.md,
  // raw/chunks): a fresh store with notes but no `.brain.db` yet still counts,
  // so we don't silently serve the empty one over one that has real content.
  // Tie-break to the canonical store only when BOTH are genuinely empty.
  const canonPopulated = hasIndex(canonicalDir) || hasContent(canonicalDir);
  const legacyPopulated = hasIndex(legacyDir) || hasContent(legacyDir);
  const serveLegacy = !canonPopulated && legacyPopulated;
  const path = serveLegacy ? legacyDir : canonicalDir;

  // Describe WHY the legacy store won, accurately for either signal.
  const legacyReason = hasIndex(legacyDir) ? "it has an index" : "it holds content";

  return {
    ...base,
    path,
    collision: true,
    warning:
      `split brain: both canonical "${canonicalId}" and legacy "${legacyId}" ` +
      `exist for this repo. Serving the ` +
      (serveLegacy
        ? `legacy store (${legacyReason}; canonical is empty). `
        : `canonical store. `) +
      `Run ${mergeCmd} to merge them into one.`,
  };
}
