/**
 * Brain → estate consolidation, stage S1b: the EXPORT half.
 *
 * Reads a wicked-brain `.brain.db` STRICTLY READ-ONLY and writes a
 * self-contained, inspectable export bundle on disk. The bundle is the
 * contract boundary between the two phases: `estate-import.mjs` drives it
 * into wicked-estate, and a human (or a test) can diff it in between.
 *
 * Import contract: wicked-estate PR #95
 * (`wicked-estate/docs/brain-consolidation-import-contract.md`). If that
 * contract changes under review, this module must be re-synced.
 *
 * Bundle layout (all written by this module):
 *   manifest.json     — format version, brain identity, source-of-truth counts
 *   documents.jsonl   — one line per `documents` row, EVERY column preserved
 *   links.jsonl       — one line per `links` row, EVERY column preserved;
 *                       confidence/evidence_count are the REAL stored values
 *                       (never omitted: brain defaults 0.5/0, estate's relate
 *                       default is 0.8 — omission would silently retune links)
 *   telemetry.json    — the EXACT `wicked-estate import-telemetry` file shape:
 *                       { access_log: [{item_id, session_id, accessed_at}],
 *                         search_misses: [{query, searched_at, session_id}] }
 *                       timestamps are epoch millis; at export time item_id is
 *                       the brain doc_id (the import phase remaps landed ids).
 *
 * Zero-loss rule: everything in the DB lands in the bundle verbatim. Mapping
 * decisions (what estate can/can't hold) happen in the import phase where they
 * are counted and reported — never here.
 */

import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { deriveSourceType } from "./sqlite-search.mjs";

/** Bundle format identifier — bump on any shape change. */
export const BUNDLE_FORMAT = "wicked-brain-estate-export/1";

/** Brain's links.confidence column default (estate's relate default is 0.8). */
export const BRAIN_DEFAULT_CONFIDENCE = 0.5;

/**
 * Read the brain's `id` the same way the server derives brain_id:
 * brain.json `id`, falling back to the directory basename.
 */
export function readBrainId(brainPath) {
  try {
    const cfg = JSON.parse(readFileSync(join(brainPath, "brain.json"), "utf-8"));
    if (cfg && typeof cfg.id === "string" && cfg.id) return cfg.id;
  } catch {
    // brain.json missing/unreadable — fall through to the basename convention.
  }
  return basename(resolve(brainPath));
}

/** True when `table` exists in the open database. */
function tableExists(db, table) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(table);
  return !!row;
}

/** Column names of `table` (empty when the table is absent). */
function tableColumns(db, table) {
  if (!tableExists(db, table)) return [];
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

/**
 * Read every signal-bearing table from a `.brain.db`, read-only.
 *
 * Opens with `{ readonly: true, fileMustExist: true }` so the live production
 * brain can never be written to or have its schema migrated by this path.
 * Older DBs that predate some columns/tables degrade gracefully (missing
 * columns → brain defaults, missing tables → empty arrays).
 *
 * Returns { documents, links, accessLog, searchMisses } with all columns.
 */
export function readBrainDb(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const docCols = tableColumns(db, "documents");
    if (docCols.length === 0) {
      throw new Error(`no 'documents' table in ${dbPath} — not a brain index`);
    }
    const documents = db
      .prepare(`SELECT * FROM documents ORDER BY path, id`)
      .all()
      .map((row) => ({
        ...row,
        source_type: deriveSourceType(row.path),
      }));

    let links = [];
    if (tableExists(db, "links")) {
      const linkCols = new Set(tableColumns(db, "links"));
      links = db
        .prepare(`SELECT rowid AS link_rowid, * FROM links ORDER BY rowid`)
        .all()
        .map((row) => ({
          ...row,
          // Defensive: pre-migration DBs lack the tuned columns entirely, and
          // a NULL must become the BRAIN default (0.5), never estate's (0.8).
          confidence:
            linkCols.has("confidence") && row.confidence != null
              ? row.confidence
              : BRAIN_DEFAULT_CONFIDENCE,
          evidence_count:
            linkCols.has("evidence_count") && row.evidence_count != null
              ? row.evidence_count
              : 0,
        }));
    }

    const accessLog = tableExists(db, "access_log")
      ? db.prepare(`SELECT doc_id, session_id, accessed_at FROM access_log ORDER BY rowid`).all()
      : [];

    const searchMisses = tableExists(db, "search_misses")
      ? db.prepare(`SELECT query, searched_at, session_id FROM search_misses ORDER BY rowid`).all()
      : [];

    return { documents, links, accessLog, searchMisses };
  } finally {
    db.close();
  }
}

/**
 * Shape brain telemetry rows into the EXACT `wicked-estate import-telemetry`
 * file shape (`wicked_estate_store::TelemetryImport`). Column mapping per the
 * PR #95 contract: `doc_id → item_id`, everything else verbatim; timestamps
 * are already epoch millis in the brain (Date.now()) and stay millis.
 */
export function buildTelemetry(accessLog, searchMisses) {
  return {
    access_log: accessLog.map((r) => ({
      item_id: String(r.doc_id),
      // Brain declares session_id NOT NULL and estate's AccessRecord requires
      // a string — but if out-of-contract data ever carries a NULL, preserve
      // it as JSON null so the import fails LOUDLY (serde error) instead of
      // silently landing a fabricated "null" session.
      session_id: r.session_id == null ? null : String(r.session_id),
      accessed_at: Number(r.accessed_at),
    })),
    search_misses: searchMisses.map((r) => ({
      query: String(r.query),
      searched_at: Number(r.searched_at),
      // session_id is nullable in both schemas — preserve null, don't coerce.
      session_id: r.session_id == null ? null : String(r.session_id),
    })),
  };
}

/** Serialize rows as JSON Lines (one JSON object per line, trailing \n). */
function toJsonl(rows) {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}

/**
 * Export a brain into a bundle directory. Pure read on the brain side;
 * creates/overwrites manifest.json, documents.jsonl, links.jsonl,
 * telemetry.json inside `bundleDir`. Returns the manifest.
 */
export function exportBundle({ brainPath, dbPath, bundleDir, brainId }) {
  const resolvedDb = dbPath || join(brainPath, ".brain.db");
  if (!existsSync(resolvedDb)) {
    throw new Error(`brain index not found: ${resolvedDb}`);
  }
  const id = brainId || (brainPath ? readBrainId(brainPath) : basename(resolve(resolvedDb, "..")));

  const { documents, links, accessLog, searchMisses } = readBrainDb(resolvedDb);
  const telemetry = buildTelemetry(accessLog, searchMisses);

  const byType = { memory: 0, chunk: 0, wiki: 0 };
  for (const d of documents) byType[d.source_type] = (byType[d.source_type] ?? 0) + 1;

  const manifest = {
    format: BUNDLE_FORMAT,
    contract: "wicked-estate PR #95 (docs/brain-consolidation-import-contract.md)",
    exported_at: Date.now(),
    brain_path: brainPath ? resolve(brainPath) : null,
    db_path: resolve(resolvedDb),
    brain_id: id,
    counts: {
      documents: documents.length,
      memories: byType.memory ?? 0,
      chunks: byType.chunk ?? 0,
      wiki: byType.wiki ?? 0,
      links: links.length,
      access_log: telemetry.access_log.length,
      search_misses: telemetry.search_misses.length,
    },
  };

  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(join(bundleDir, "documents.jsonl"), toJsonl(documents), "utf-8");
  writeFileSync(join(bundleDir, "links.jsonl"), toJsonl(links), "utf-8");
  writeFileSync(join(bundleDir, "telemetry.json"), JSON.stringify(telemetry, null, 2) + "\n", "utf-8");
  writeFileSync(join(bundleDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  return manifest;
}
