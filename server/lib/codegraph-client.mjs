import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { dbPath, staleness } from "./codegraph-index.mjs";

// Pinned by Task 1 (docs/codegraph-contract.md): edges are stored
// consumer->producer, edge(source=dependent, target=dependency). So dependents
// of X are rows WHERE target=X (collect source); dependencies are the inverse.
const DEPENDENTS_BY = "target";
const DEPENDENCIES_BY = DEPENDENTS_BY === "target" ? "source" : "target";

export class CodegraphClient {
  #sourcePath;
  #db = null;

  constructor(sourcePath) { this.#sourcePath = sourcePath; }

  #open() {
    if (this.#db) return this.#db;
    const p = dbPath(this.#sourcePath);
    if (!existsSync(p)) return null;
    this.#db = new Database(p, { readonly: true });
    return this.#db;
  }

  close() { if (this.#db) { this.#db.close(); this.#db = null; } }

  #nodeRows(ids) {
    if (ids.length === 0) return [];
    const ph = ids.map(() => "?").join(",");
    return this.#db.prepare(
      `SELECT id, kind, name, file_path, start_line, end_line FROM nodes WHERE id IN (${ph})`
    ).all(...ids);
  }

  // BFS over edges. matchCol = the column matched against the frontier;
  // collectCol = the column collected as the next frontier.
  #walk(start, { matchCol, collectCol, maxDepth }) {
    const stmt = this.#db.prepare(
      `SELECT DISTINCT ${collectCol} AS next FROM edges WHERE ${matchCol} = ?`);
    const seen = new Set();
    let frontier = [start];
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      const nextFrontier = [];
      for (const node of frontier) {
        for (const row of stmt.all(node)) {
          if (row.next && row.next !== start && !seen.has(row.next)) {
            seen.add(row.next);
            nextFrontier.push(row.next);
          }
        }
      }
      frontier = nextFrontier;
      depth += 1;
    }
    return [...seen];
  }

  #unavailable() {
    return { engine: "unavailable",
      reason: `no graph at ${dbPath(this.#sourcePath)} — run graph-index`,
      staleness: staleness(this.#sourcePath) };
  }

  /** Transitive dependents — "what breaks if I change X". */
  blastRadius({ node, maxDepth = 25 }) {
    if (!this.#open()) return this.#unavailable();
    const ids = this.#walk(node, { matchCol: DEPENDENTS_BY, collectCol: DEPENDENCIES_BY, maxDepth });
    return { node, dependents: this.#nodeRows(ids), staleness: staleness(this.#sourcePath) };
  }

  /** Direct dependents only (depth 1). */
  callers({ node }) {
    if (!this.#open()) return this.#unavailable();
    const ids = this.#walk(node, { matchCol: DEPENDENTS_BY, collectCol: DEPENDENCIES_BY, maxDepth: 1 });
    return { node, callers: this.#nodeRows(ids), staleness: staleness(this.#sourcePath) };
  }

  /** Transitive dependencies — downstream lineage. */
  lineage({ node, maxDepth = 25 }) {
    if (!this.#open()) return this.#unavailable();
    const ids = this.#walk(node, { matchCol: DEPENDENCIES_BY, collectCol: DEPENDENTS_BY, maxDepth });
    return { node, dependencies: this.#nodeRows(ids), staleness: staleness(this.#sourcePath) };
  }
}
