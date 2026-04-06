import Database from "better-sqlite3";
import { parseWikilinks } from "./wikilinks.mjs";
import { statSync } from "node:fs";

function escapeFtsQuery(query) {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w.replace(/"/g, '""')}"`)
    .join(" ");
}

/** Weight factor for backlink count in search ranking (PageRank-lite). */
const BACKLINK_WEIGHT = 0.5;

export class SqliteSearch {
  #db;
  #brainId;
  #startTime;

  constructor(dbPath, brainId) {
    this.#brainId = brainId;
    this.#startTime = Date.now();
    this.#db = new Database(dbPath);
    this.#db.pragma("journal_mode = WAL");
    this.#initSchema();
  }

  #initSchema() {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        frontmatter TEXT,
        brain_id TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        id,
        path,
        content,
        brain_id,
        tokenize='porter unicode61'
      );

      CREATE TABLE IF NOT EXISTS links (
        source_id TEXT NOT NULL,
        source_brain TEXT NOT NULL,
        target_path TEXT NOT NULL,
        target_brain TEXT,
        rel TEXT,
        link_text TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
      CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);

      CREATE TABLE IF NOT EXISTS access_log (
        doc_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        accessed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_access_doc ON access_log(doc_id);
      CREATE INDEX IF NOT EXISTS idx_access_session ON access_log(session_id);
    `);
  }

  index(doc) {
    const { id, path, content, frontmatter = null } = doc;
    const brainId = this.#brainId;
    const indexedAt = Date.now();

    const upsertDoc = this.#db.prepare(`
      INSERT INTO documents (id, path, content, frontmatter, brain_id, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        content = excluded.content,
        frontmatter = excluded.frontmatter,
        brain_id = excluded.brain_id,
        indexed_at = excluded.indexed_at
    `);

    const deleteFts = this.#db.prepare(`DELETE FROM documents_fts WHERE id = ?`);
    const insertFts = this.#db.prepare(`
      INSERT INTO documents_fts (id, path, content, brain_id)
      VALUES (?, ?, ?, ?)
    `);

    const deleteLinks = this.#db.prepare(`DELETE FROM links WHERE source_id = ?`);
    const insertLink = this.#db.prepare(`
      INSERT INTO links (source_id, source_brain, target_path, target_brain, rel, link_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const run = this.#db.transaction(() => {
      upsertDoc.run(id, path, content, frontmatter, brainId, indexedAt);
      deleteFts.run(id);
      insertFts.run(id, path, content, brainId);
      deleteLinks.run(id);
      const wikilinks = parseWikilinks(content);
      for (const link of wikilinks) {
        insertLink.run(id, brainId, link.path, link.brain, link.rel || null, link.raw);
      }
    });

    run();
  }

  remove(id) {
    const run = this.#db.transaction(() => {
      this.#db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
      this.#db.prepare(`DELETE FROM documents_fts WHERE id = ?`).run(id);
      this.#db.prepare(`DELETE FROM links WHERE source_id = ?`).run(id);
    });
    run();
  }

  reindex(docs) {
    const run = this.#db.transaction(() => {
      this.#db.exec(`DELETE FROM documents`);
      this.#db.exec(`DELETE FROM documents_fts`);
      this.#db.exec(`DELETE FROM links`);
      for (const doc of docs) {
        this.index(doc);
      }
    });
    run();
  }

  search({ query, limit = 10, offset = 0, since = null, session_id = null }) {
    const escaped = escapeFtsQuery(query);
    if (!escaped) return { results: [], total_matches: 0, showing: 0 };

    const sinceClause = since ? `AND d.indexed_at >= ?` : "";
    const sinceParams = since ? [new Date(since).getTime()] : [];

    const rows = this.#db
      .prepare(`
        SELECT
          d.id,
          d.path,
          d.brain_id,
          snippet(documents_fts, 2, '<b>', '</b>', '…', 32) AS snippet,
          COALESCE(link_count.cnt, 0) AS backlink_count
        FROM documents_fts f
        JOIN documents d ON d.id = f.id
        LEFT JOIN (
          SELECT target_path, COUNT(*) AS cnt
          FROM links
          GROUP BY target_path
        ) link_count ON d.path = link_count.target_path
        WHERE documents_fts MATCH ?
        ${sinceClause}
        ORDER BY (f.rank - (COALESCE(link_count.cnt, 0) * ${BACKLINK_WEIGHT}))
        LIMIT ? OFFSET ?
      `)
      .all(escaped, ...sinceParams, limit, offset);

    const countRow = this.#db
      .prepare(
        `SELECT COUNT(*) as cnt FROM documents_fts f
         JOIN documents d ON d.id = f.id
         WHERE documents_fts MATCH ?
         ${sinceClause}`
      )
      .get(escaped, ...sinceParams);

    const total_matches = countRow ? countRow.cnt : 0;

    // Log access for each returned document if session_id provided
    if (session_id && rows.length > 0) {
      const logAccess = this.#db.prepare(
        `INSERT INTO access_log (doc_id, session_id, accessed_at) VALUES (?, ?, ?)`
      );
      const now = Date.now();
      const logAll = this.#db.transaction(() => {
        for (const row of rows) {
          logAccess.run(row.id, session_id, now);
        }
      });
      logAll();
    }

    return {
      results: rows,
      total_matches,
      showing: rows.length,
    };
  }

  federatedSearch({ query, brains = [], limit = 10 }) {
    const localResults = this.search({ query, limit });
    const allResults = [...localResults.results];
    const unreachable = [];

    for (const { brainId, dbPath } of brains) {
      try {
        const attached = `brain_${brainId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        this.#db.prepare(`ATTACH DATABASE ? AS ${attached}`).run(dbPath);
        try {
          const escaped = escapeFtsQuery(query);
          const rows = this.#db
            .prepare(`
              SELECT
                d.id,
                d.path,
                d.brain_id,
                snippet(${attached}.documents_fts, 2, '<b>', '</b>', '…', 32) AS snippet
              FROM ${attached}.documents_fts f
              JOIN ${attached}.documents d ON d.id = f.id
              WHERE ${attached}.documents_fts MATCH ?
              ORDER BY rank
              LIMIT ?
            `)
            .all(escaped, limit);
          allResults.push(...rows);
        } finally {
          this.#db.prepare(`DETACH DATABASE ${attached}`).run();
        }
      } catch {
        unreachable.push(brainId);
      }
    }

    allResults.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    const trimmed = allResults.slice(0, limit);

    return {
      results: trimmed,
      total_matches: localResults.total_matches,
      showing: trimmed.length,
      unreachable,
    };
  }

  backlinks(id) {
    return this.#db
      .prepare(`
        SELECT source_id, source_brain, link_text
        FROM links
        WHERE target_path = ?
      `)
      .all(id);
  }

  forwardLinks(id) {
    const rows = this.#db
      .prepare(`
        SELECT target_path, target_brain
        FROM links
        WHERE source_id = ?
      `)
      .all(id);
    return rows.map((r) => r.target_path);
  }

  stats() {
    const total = this.#db
      .prepare(`SELECT COUNT(*) as cnt FROM documents`)
      .get().cnt;

    const chunks = this.#db
      .prepare(`SELECT COUNT(*) as cnt FROM documents WHERE path LIKE 'chunks/%'`)
      .get().cnt;

    const wiki = this.#db
      .prepare(`SELECT COUNT(*) as cnt FROM documents WHERE path LIKE 'wiki/%'`)
      .get().cnt;

    const lastRow = this.#db
      .prepare(`SELECT MAX(indexed_at) as last FROM documents`)
      .get();
    const last_indexed = lastRow ? lastRow.last : null;

    const dbFile = this.#db.name;
    let db_size = null;
    try {
      db_size = statSync(dbFile).size;
    } catch {
      // in-memory or inaccessible
    }

    return { total, chunks, wiki, last_indexed, db_size };
  }

  health() {
    return {
      status: "ok",
      uptime: Date.now() - this.#startTime,
      brain_id: this.#brainId,
    };
  }

  accessLog(docId) {
    const row = this.#db.prepare(`
      SELECT
        COUNT(*) as access_count,
        COUNT(DISTINCT session_id) as session_diversity
      FROM access_log
      WHERE doc_id = ?
    `).get(docId);
    return row;
  }

  contradictions() {
    return this.#db
      .prepare(`
        SELECT source_id, source_brain, target_path, target_brain, link_text
        FROM links
        WHERE rel = 'contradicts'
      `)
      .all();
  }

  close() {
    this.#db.close();
  }
}
