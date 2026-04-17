import fs from "node:fs/promises";
import path from "node:path";

/**
 * Walk a brain path and surface every authored `.md` file under the content
 * subdirectories (chunks/, wiki/, memory/). Deliberately excludes `_meta/`,
 * `raw/`, `.brain.db`, and any dotfile/dotdir. Paths returned are relative to
 * the brain path and use forward slashes per INV-PATHS-FORWARD.
 */
const CONTENT_DIRS = ["chunks", "wiki", "memory"];

export async function walkBrainContent(brainPath) {
  const out = [];
  for (const rel of CONTENT_DIRS) {
    const abs = path.join(brainPath, rel);
    await walk(abs, rel, out);
  }
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

/**
 * Remove everything under chunks/, wiki/, memory/ in the brain path. Leaves
 * the directories themselves (with empty .gitkeep placeholders) so the shape
 * of the brain survives a purge. Returns a per-dir file count.
 */
export async function purgeBrainContent(brainPath) {
  const counts = {};
  for (const rel of CONTENT_DIRS) {
    const abs = path.join(brainPath, rel);
    counts[rel] = await removeDirContents(abs);
    await fs.mkdir(abs, { recursive: true });
    await fs.writeFile(path.join(abs, ".gitkeep"), "", "utf8").catch(() => {});
  }
  return counts;
}

// --- internals ---

async function walk(absDir, relDir, out) {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const absChild = path.join(absDir, e.name);
    const relChild = path.posix.join(relDir, e.name);
    if (e.isDirectory()) {
      await walk(absChild, relChild, out);
    } else if (e.isFile() && e.name.endsWith(".md")) {
      out.push({ abs: absChild, rel: relChild.replace(/\\/g, "/") });
    }
  }
}

async function removeDirContents(absDir) {
  let count = 0;
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      count += await removeDirContents(abs);
      await fs.rm(abs, { recursive: true, force: true });
    } else if (e.isFile()) {
      await fs.rm(abs, { force: true });
      if (!e.name.startsWith(".")) count += 1;
    }
  }
  return count;
}
