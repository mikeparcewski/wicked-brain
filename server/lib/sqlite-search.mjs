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

/** Weight factor for access count in search ranking. */
const SEARCH_ACCESS_WEIGHT = 0.1;

/** Candidate scoring weights for promote mode. */
const PROMOTE_ACCESS_WEIGHT = 0.3;
const PROMOTE_SESSION_WEIGHT = 0.3;
const PROMOTE_BACKLINK_WEIGHT = 0.2;
const PROMOTE_RECENCY_WEIGHT = 0.2;
const MAX_AGE_MS = 7776000000; // 90 days
const ARCHIVE_AGE_MS = 2592000000; // 30 days

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

    this.#migrate();
  }

  /**
   * Versioned schema migration system.
   * Each migration upgrades from version N-1 to N.
   * Migrations are idempotent — safe to re-run.
   */
  #migrate() {
    // Ensure _schema_version table exists
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS _schema_version (
        version INTEGER NOT NULL
      )
    `);

    const row = this.#db.prepare(`SELECT version FROM _schema_version LIMIT 1`).get();
    let currentVersion = row ? row.version : 0;

    // Migration 1: add rel column to links table + access_log table
    if (currentVersion < 1) {
      try { this.#db.prepare(`SELECT rel FROM links LIMIT 0`).get(); } catch {
        this.#db.exec(`ALTER TABLE links ADD COLUMN rel TEXT`);
      }
      // access_log is created by #initSchema's CREATE TABLE IF NOT EXISTS,
      // but for databases that predate it, ensure it exists
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS access_log (
          doc_id TEXT NOT NULL, session_id TEXT NOT NULL, accessed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_access_doc ON access_log(doc_id);
        CREATE INDEX IF NOT EXISTS idx_access_session ON access_log(session_id);
      `);
      currentVersion = 1;
    }

    // Future migrations go here:
    // if (currentVersion < 2) { ... currentVersion = 2; }

    // Persist the current version
    this.#db.exec(`DELETE FROM _schema_version`);
    this.#db.prepare(`INSERT INTO _schema_version (version) VALUES (?)`).run(currentVersion);
  }

  /** Returns the current schema version number. */
  schemaVersion() {
    try {
      const row = this.#db.prepare(`SELECT version FROM _schema_version LIMIT 1`).get();
      return row ? row.version : 0;
    } catch {
      return 0;
    }
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
          COALESCE(link_count.cnt, 0) AS backlink_count,
          COALESCE(ac.cnt, 0) AS access_count
        FROM documents_fts f
        JOIN documents d ON d.id = f.id
        LEFT JOIN (
          SELECT target_path, COUNT(*) AS cnt
          FROM links
          GROUP BY target_path
        ) link_count ON d.path = link_count.target_path
        LEFT JOIN (
          SELECT doc_id, COUNT(*) AS cnt
          FROM access_log
          GROUP BY doc_id
        ) ac ON d.id = ac.doc_id
        WHERE documents_fts MATCH ?
        ${sinceClause}
        ORDER BY (f.rank - (COALESCE(link_count.cnt, 0) * ${BACKLINK_WEIGHT}) - (COALESCE(ac.cnt, 0) * ${SEARCH_ACCESS_WEIGHT}))
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

    const memory = this.#db
      .prepare(`SELECT COUNT(*) as cnt FROM documents WHERE path LIKE 'memory/%'`)
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

    return { total, chunks, wiki, memory, last_indexed, db_size };
  }

  health() {
    return {
      status: "ok",
      uptime: Date.now() - this.#startTime,
      brain_id: this.#brainId,
    };
  }

  candidates({ mode, limit = 20 }) {
    const now = Date.now();

    if (mode === "promote") {
      return this.#db.prepare(`
        SELECT d.id, d.path, d.indexed_at, d.frontmatter,
               COALESCE(ac.access_count, 0) AS access_count,
               COALESCE(ac.session_diversity, 0) AS session_diversity,
               COALESCE(lc.cnt, 0) AS backlink_count
        FROM documents d
        LEFT JOIN (
          SELECT doc_id,
                 COUNT(*) AS access_count,
                 COUNT(DISTINCT session_id) AS session_diversity
          FROM access_log GROUP BY doc_id
        ) ac ON d.id = ac.doc_id
        LEFT JOIN (
          SELECT target_path, COUNT(*) AS cnt
          FROM links GROUP BY target_path
        ) lc ON d.path = lc.target_path
        WHERE d.path LIKE 'chunks/%' OR d.path LIKE 'memory/%'
        ORDER BY (
          COALESCE(ac.access_count, 0) * ${PROMOTE_ACCESS_WEIGHT}
          + COALESCE(ac.session_diversity, 0) * ${PROMOTE_SESSION_WEIGHT}
          + COALESCE(lc.cnt, 0) * ${PROMOTE_BACKLINK_WEIGHT}
          + (1.0 - MIN(CAST((${now} - d.indexed_at) AS REAL) / ${MAX_AGE_MS}, 1.0)) * ${PROMOTE_RECENCY_WEIGHT}
        ) DESC
        LIMIT ?
      `).all(limit);
    }

    if (mode === "archive") {
      const cutoff = now - ARCHIVE_AGE_MS;
      return this.#db.prepare(`
        SELECT d.id, d.path, d.indexed_at, d.frontmatter,
               COALESCE(ac.access_count, 0) AS access_count,
               COALESCE(lc.cnt, 0) AS backlink_count
        FROM documents d
        LEFT JOIN (
          SELECT doc_id, COUNT(*) AS access_count
          FROM access_log GROUP BY doc_id
        ) ac ON d.id = ac.doc_id
        LEFT JOIN (
          SELECT target_path, COUNT(*) AS cnt
          FROM links GROUP BY target_path
        ) lc ON d.path = lc.target_path
        WHERE (d.path LIKE 'chunks/%' OR d.path LIKE 'memory/%')
          AND COALESCE(ac.access_count, 0) = 0
          AND COALESCE(lc.cnt, 0) = 0
          AND d.indexed_at < ?
        ORDER BY d.indexed_at ASC
        LIMIT ?
      `).all(cutoff, limit);
    }

    throw new Error(`Unknown candidates mode: ${mode}`);
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

  recentMemories({ days = 7, limit = 10 } = {}) {
    const since = Date.now() - (days * 86400000);
    return this.#db.prepare(`
      SELECT id, path, frontmatter, indexed_at
      FROM documents
      WHERE path LIKE 'memory/%'
        AND indexed_at >= ?
      ORDER BY indexed_at DESC
      LIMIT ?
    `).all(since, limit);
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
