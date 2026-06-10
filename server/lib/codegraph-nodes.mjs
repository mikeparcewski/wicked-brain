/**
 * codegraph-nodes.mjs — self-noding helpers for injected-edge extractors.
 *
 * codegraph indexes *code* (tree-sitter parsed). Injected edges to/from .md
 * files or virtual capability nodes need their endpoints to exist in the nodes
 * table first. These helpers create them idempotently via INSERT OR IGNORE, so
 * real code files codegraph already indexed are never overwritten.
 *
 * Port of scripts/codegraph/_graph_nodes.py, targeting the exact schema in
 * docs/codegraph-contract.md (all NOT NULL columns populated).
 */

// Populates every NOT NULL column the codegraph `nodes` schema requires.
// Columns with defaults (is_exported etc.) are omitted — SQLite fills them.
const INSERT_NODE =
  "INSERT OR IGNORE INTO nodes " +
  "(id, kind, name, qualified_name, file_path, language, " +
  " start_line, end_line, start_column, end_column, updated_at) " +
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)";

function nowMs() {
  return Date.now();
}

/**
 * Ensure a `file:<relpath>` node exists in the graph; return its id.
 *
 * For .md command/agent files that codegraph skipped, this creates a synthetic
 * file node so dispatch/capability edges can anchor. For a real source file
 * codegraph already indexed, INSERT OR IGNORE is a no-op (real node preserved).
 *
 * @param {import("better-sqlite3").Database} db - read-write Database
 * @param {string} relpath - POSIX-relative path from repo root
 * @param {string} [language] - language tag (default "markdown")
 * @returns {string} the node id `file:<relpath>`
 */
export function ensureFileNode(db, relpath, language = "markdown") {
  const id = `file:${relpath}`;
  const name = relpath.split("/").pop();
  db.prepare(INSERT_NODE).run(id, "file", name, relpath, relpath, language, 1, 1, nowMs());
  return id;
}

/**
 * Ensure a synthetic non-file node (e.g. `capability:<name>`) exists; return id.
 *
 * Populates every NOT NULL column the schema demands — the original capability
 * insert set only id/kind/name/file_path and would violate NOT NULL constraints.
 *
 * @param {import("better-sqlite3").Database} db - read-write Database
 * @param {string} id - node id (e.g. "capability:foo")
 * @param {string} kind - node kind (e.g. "capability")
 * @param {string} name - human-readable name
 * @param {string|null} [filePath] - optional file_path; falls back to id
 * @returns {string} the node id
 */
export function ensureVirtualNode(db, id, kind, name, filePath = null) {
  db.prepare(INSERT_NODE).run(
    id, kind, name, name, filePath ?? id, "virtual",
    0, 0, nowMs()
  );
  return id;
}
