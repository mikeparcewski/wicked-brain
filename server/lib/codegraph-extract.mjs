/**
 * codegraph-extract.mjs — extractor registry (builtins + drop-ins).
 *
 * Ships three built-in extractors and discovers per-repo drop-in extractors
 * under <sourcePath>/.codegraph-extractors/*.mjs, each exporting `extract`.
 *
 * Fail-open per extractor: one throwing must not abort the rest.
 *
 * NOTE on drop-in imports: this imports and runs code from the target repo —
 * by design (the repo provides trusted extractors), same trust level as
 * running its tests.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { extract as busExtract } from "./codegraph-extractors/bus.mjs";
import { extract as dispatchExtract } from "./codegraph-extractors/dispatch.mjs";
import { extract as capabilityExtract } from "./codegraph-extractors/capability.mjs";
import { ensureFileNode, ensureVirtualNode } from "./codegraph-nodes.mjs";

const BUILTINS = [
  { label: "bus", extract: busExtract },
  { label: "dispatch", extract: dispatchExtract },
  { label: "capability", extract: capabilityExtract },
];

/**
 * Discover drop-in extractors under <sourcePath>/.codegraph-extractors/*.mjs.
 * Each file must export a function `extract`. Sorted for deterministic ordering.
 * Broken files (import error or missing export) are silently skipped.
 *
 * @param {string} sourcePath
 * @returns {Promise<Array<{label:string, extract:Function}>>}
 */
export async function discoverDropins(sourcePath) {
  const dir = join(sourcePath, ".codegraph-extractors");
  if (!existsSync(dir)) return [];

  let entries;
  try {
    entries = readdirSync(dir)
      .filter((f) => f.endsWith(".mjs"))
      .sort();
  } catch {
    return [];
  }

  const dropins = [];
  for (const filename of entries) {
    const fullpath = join(dir, filename);
    try {
      const mod = await import(pathToFileURL(fullpath).href);
      if (typeof mod.extract === "function") {
        dropins.push({ label: `dropin:${filename}`, extract: mod.extract });
      }
    } catch {
      // Broken drop-in — skip, not fatal
    }
  }
  return dropins;
}

/**
 * Run all extractors (builtins + drop-ins) against the open read-write db.
 * Fail-open per extractor: one throwing must not abort the rest.
 *
 * @param {{ db: import("better-sqlite3").Database, sourcePath: string }} opts
 * @returns {Promise<Record<string, object> & { total_injected_edges: number, dropins: string[] }>}
 */
export async function runExtractors({ db, sourcePath }) {
  const dropins = await discoverDropins(sourcePath);
  const dropin_labels = dropins.map((d) => d.label);
  const all = [...BUILTINS, ...dropins];

  const nodes = { ensureFileNode, ensureVirtualNode };

  const out = {};
  let total = 0;

  for (const ext of all) {
    try {
      const counts = await ext.extract({ db, sourcePath, nodes });
      out[ext.label] = counts;
      total += counts.edges_added || 0;
    } catch (e) {
      out[ext.label] = { error: String((e && e.message) || e) };
    }
  }

  return { ...out, total_injected_edges: total, dropins: dropin_labels };
}
