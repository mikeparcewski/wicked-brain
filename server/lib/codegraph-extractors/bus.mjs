/**
 * codegraph-extractors/bus.mjs — wicked-bus producer→consumer injected edges.
 *
 * Port of scripts/codegraph/inject_edges.py with the edge direction CORRECTED:
 *
 *   Garden's inject_edges.py inserts (source=producer, target=consumer).
 *   The contract doc resolves the ambiguity: edges are stored
 *   source=dependent→target=dependency, and DEPENDENTS_BY="target". So
 *   blast-radius(X) = WHERE target=X (collect source). For the consumer to
 *   surface as a dependent of the producer, the edge must be:
 *
 *       source = consumer (dependent — breaks when producer's event changes)
 *       target = producer (dependency — the thing being changed)
 *
 * This is the corrected direction. Garden's version inserts the opposite and
 * is a latent bug (blast-radius of the producer would NOT surface the consumer).
 *
 * Algorithm:
 *   1. DELETE edges WHERE provenance='injected:bus'   (idempotent)
 *   2. Read <sourcePath>/scripts/_bus_consumers.json
 *   3. Grep <sourcePath>/scripts/**\/*.py for event-string literals
 *   4. For each consumer: confirm node exists; for each producer: confirm node
 *      exists; INSERT edge (source=consumer, target=producer)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const EVENT_RE = /["']((?:wicked|wg)\.[a-z0-9_]+(?:\.[a-z0-9_]+)+)["']/g;
const INJECTED_PROVENANCE = "injected:bus";

/**
 * Read and parse _bus_consumers.json. Returns [] on missing or malformed file.
 * @param {string} sourcePath
 * @returns {{ event_filter: string, module: string }[]}
 */
function readConsumers(sourcePath) {
  const p = join(sourcePath, "scripts", "_bus_consumers.json");
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    const consumers = data?.consumers;
    if (!Array.isArray(consumers)) return [];
    return consumers.filter((c) => c?.event_filter && c?.module);
  } catch {
    return [];
  }
}

/**
 * Recursively collect all .py files under dir, skipping __pycache__ dirs
 * and files whose basename ends with _bus_consumers.py.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectPyFiles(dir) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (entry === "__pycache__") continue;
      results.push(...collectPyFiles(full));
    } else if (entry.endsWith(".py") && !entry.endsWith("_bus_consumers.py")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Build event→Set<producerRelpath> map by grepping scripts/**\/*.py.
 * @param {string} sourcePath
 * @param {Set<string>} events
 * @returns {Map<string, Set<string>>}
 */
function buildProducerMap(sourcePath, events) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const ev of events) map.set(ev, new Set());

  const scriptsDir = join(sourcePath, "scripts");
  const pyFiles = collectPyFiles(scriptsDir);

  for (const absPath of pyFiles) {
    let text;
    try { text = readFileSync(absPath, "utf8"); } catch { continue; }
    // posix relpath relative to sourcePath
    const rel = relative(sourcePath, absPath).split(sep).join("/");
    // reset lastIndex between files
    EVENT_RE.lastIndex = 0;
    let m;
    while ((m = EVENT_RE.exec(text)) !== null) {
      const ev = m[1];
      if (map.has(ev)) {
        map.get(ev).add(rel);
      }
      // reset not needed between matches in same string, but be safe
    }
  }
  return map;
}

/**
 * Confirm a file node exists in the graph; return the node id or null.
 * @param {import("better-sqlite3").Database} db
 * @param {string} relpath
 * @returns {string|null}
 */
function fileNodeId(db, relpath) {
  const id = `file:${relpath}`;
  const row = db.prepare("SELECT 1 FROM nodes WHERE id = ?").get(id);
  return row ? id : null;
}

/**
 * Extract wicked-bus producer→consumer injected edges into the codegraph DB.
 *
 * @param {{ db: import("better-sqlite3").Database, sourcePath: string }} opts
 * @returns {{ edges_added: number, skipped: number, consumers: number }}
 */
export function extract({ db, sourcePath }) {
  // 1. Idempotent: clear prior bus edges
  db.prepare("DELETE FROM edges WHERE provenance = ?").run(INJECTED_PROVENANCE);

  // 2. Load consumer registry
  const consumers = readConsumers(sourcePath);
  if (consumers.length === 0) {
    return { edges_added: 0, skipped: 0, consumers: 0 };
  }

  // 3. Grep for producers
  const events = new Set(consumers.map((c) => c.event_filter));
  const producerMap = buildProducerMap(sourcePath, events);

  // 4. Insert edges
  const insertEdge = db.prepare(
    "INSERT INTO edges (source, target, kind, metadata, provenance) VALUES (?, ?, ?, ?, ?)"
  );

  let edges_added = 0;
  let skipped = 0;

  for (const { event_filter: ev, module: consumerMod } of consumers) {
    // Confirm consumer node exists
    const consumerNodeId = fileNodeId(db, consumerMod);
    if (!consumerNodeId) {
      skipped++;
      continue;
    }

    const producers = producerMap.get(ev) ?? new Set();
    for (const prodRelpath of [...producers].sort()) {
      // Don't self-link
      if (prodRelpath === consumerMod) continue;

      // Confirm producer node exists
      const producerNodeId = fileNodeId(db, prodRelpath);
      if (!producerNodeId) {
        skipped++;
        continue;
      }

      // DIRECTION: source=consumer (dependent), target=producer (dependency)
      // blastRadius(producer) = WHERE target=producer → source=consumer ✓
      insertEdge.run(
        consumerNodeId,              // source = consumer (dependent)
        producerNodeId,              // target = producer (dependency)
        "references",
        JSON.stringify({ injected: "bus", event: ev }),
        INJECTED_PROVENANCE
      );
      edges_added++;
    }
  }

  return { edges_added, skipped, consumers: consumers.length };
}
