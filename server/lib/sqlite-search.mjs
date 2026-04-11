import Database from "better-sqlite3";
import { parseWikilinks } from "./wikilinks.mjs";
import { statSync } from "node:fs";

/**
 * Extracts body text from a document, stripping YAML frontmatter.
 * Falls back to the raw content if no frontmatter is detected.
 */
function extractBodyExcerpt(content, maxLen = 300) {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)/);
  const body = match ? match[1] : content;
  return body.trim().slice(0, maxLen);
}

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

/** Weight factor for average backlink confidence in search ranking. */
const CONFIDENCE_WEIGHT = 0.3;

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
        link_text TEXT,
        confidence REAL DEFAULT 0.5,
        evidence_count INTEGER DEFAULT 0
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

      CREATE TABLE IF NOT EXISTS search_misses (
        query TEXT NOT NULL,
        searched_at INTEGER NOT NULL,
        session_id TEXT
      );
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

    // Migration 2: add confidence + evidence_count to links, add search_misses table
    if (currentVersion < 2) {
      try { this.#db.prepare(`SELECT confidence FROM links LIMIT 0`).get(); } catch {
        this.#db.exec(`ALTER TABLE links ADD COLUMN confidence REAL DEFAULT 0.5`);
      }
      try { this.#db.prepare(`SELECT evidence_count FROM links LIMIT 0`).get(); } catch {
        this.#db.exec(`ALTER TABLE links ADD COLUMN evidence_count INTEGER DEFAULT 0`);
      }
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS search_misses (
          query TEXT NOT NULL,
          searched_at INTEGER NOT NULL,
          session_id TEXT
        )
      `);
      currentVersion = 2;
    }

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

  /** Extract YAML frontmatter block from content if present. Returns null if none. */
  static #extractFrontmatter(content) {
    const m = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    return m ? m[1] : null;
  }

  index(doc) {
    const { id, path, content } = doc;
    // Auto-extract frontmatter from content when not provided explicitly
    const frontmatter = doc.frontmatter ?? SqliteSearch.#extractFrontmatter(content);
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
          SUBSTR(d.content, 1, 1000) AS raw_content,
          COALESCE(link_count.cnt, 0) AS backlink_count,
          COALESCE(ac.cnt, 0) AS access_count,
          COALESCE(link_conf.avg_conf, 0.5) AS avg_backlink_confidence
        FROM documents_fts f
        JOIN documents d ON d.id = f.id
        LEFT JOIN (
          SELECT target_path, COUNT(*) AS cnt
          FROM links
          GROUP BY target_path
        ) link_count ON d.path = link_count.target_path
        LEFT JOIN (
          SELECT target_path, AVG(confidence) AS avg_conf
          FROM links
          GROUP BY target_path
        ) link_conf ON d.path = link_conf.target_path
        LEFT JOIN (
          SELECT doc_id, COUNT(*) AS cnt
          FROM access_log
          GROUP BY doc_id
        ) ac ON d.id = ac.doc_id
        WHERE documents_fts MATCH ?
        ${sinceClause}
        ORDER BY (f.rank - (COALESCE(link_count.cnt, 0) * ${BACKLINK_WEIGHT}) - (COALESCE(ac.cnt, 0) * ${SEARCH_ACCESS_WEIGHT}) - (COALESCE(link_conf.avg_conf, 0.5) * ${CONFIDENCE_WEIGHT}))
        LIMIT ? OFFSET ?
      `)
      .all(escaped, ...sinceParams, limit, offset)
      .map((row) => {
        const body_excerpt = extractBodyExcerpt(row.raw_content ?? "");
        delete row.raw_content;
        return { ...row, body_excerpt };
      });

    const countRow = this.#db
      .prepare(
        `SELECT COUNT(*) as cnt FROM documents_fts f
         JOIN documents d ON d.id = f.id
         WHERE documents_fts MATCH ?
         ${sinceClause}`
      )
      .get(escaped, ...sinceParams);

    const total_matches = countRow ? countRow.cnt : 0;

    // Log search miss when no results returned
    if (total_matches === 0) {
      this.#db.prepare(
        `INSERT INTO search_misses (query, searched_at, session_id) VALUES (?, ?, ?)`
      ).run(query, Date.now(), session_id ?? null);
    }

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

  /**
   * Confirm or contradict a link, adjusting its confidence score.
   * verdict: "confirm" → confidence += 0.1 (capped at 1.0)
   * verdict: "contradict" → confidence -= 0.2 (floored at 0.0)
   * Returns the updated link row, or null if no matching link was found.
   */
  confirmLink(sourceId, targetPath, verdict) {
    const link = this.#db.prepare(`
      SELECT rowid, confidence, evidence_count
      FROM links
      WHERE source_id = ? AND target_path = ?
      LIMIT 1
    `).get(sourceId, targetPath);

    if (!link) return null;

    let newConfidence;
    if (verdict === "confirm") {
      newConfidence = Math.min(link.confidence + 0.1, 1.0);
    } else if (verdict === "contradict") {
      newConfidence = Math.max(link.confidence - 0.2, 0.0);
    } else {
      throw new Error(`Unknown verdict: ${verdict}. Expected "confirm" or "contradict".`);
    }

    this.#db.prepare(`
      UPDATE links
      SET confidence = ?, evidence_count = evidence_count + 1
      WHERE rowid = ?
    `).run(newConfidence, link.rowid);

    return this.#db.prepare(`
      SELECT source_id, target_path, confidence, evidence_count
      FROM links
      WHERE rowid = ?
    `).get(link.rowid);
  }

  /**
   * Returns link health statistics for the lint skill.
   * - broken_links: links where target_path doesn't exist in documents table
   * - low_confidence_links: links where confidence < 0.3
   * - total_links: total link count
   * - avg_confidence: average confidence across all links
   */
  linkHealth() {
    const totalsRow = this.#db.prepare(`
      SELECT COUNT(*) AS total_links, AVG(confidence) AS avg_confidence
      FROM links
    `).get();

    const brokenRow = this.#db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM links l
      WHERE NOT EXISTS (
        SELECT 1 FROM documents d WHERE d.path = l.target_path
      )
    `).get();

    const lowConfRow = this.#db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM links
      WHERE confidence < 0.3
    `).get();

    return {
      total_links: totalsRow.total_links ?? 0,
      avg_confidence: totalsRow.avg_confidence ?? null,
      broken_links: brokenRow.cnt ?? 0,
      low_confidence_links: lowConfRow.cnt ?? 0,
    };
  }

  /**
   * Returns tag frequency data for synonym detection.
   * Parses frontmatter from all documents and extracts `contains` arrays.
   * Returns [{tag, count}] sorted by count descending.
   */
  tagFrequency() {
    const rows = this.#db.prepare(`
      SELECT frontmatter FROM documents WHERE frontmatter IS NOT NULL
    `).all();

    const counts = new Map();

    for (const row of rows) {
      const fm = row.frontmatter;
      // Match: contains: tag1 tag2 tag3  (space-separated inline)
      // or contains: ["tag1","tag2"]  (JSON array)
      // or multi-line YAML list (- tag per line)
      // Note: \S required after contains: to avoid matching block-list headers
      const inlineMatch = fm.match(/^contains:[ \t]+(\S.*)$/m);
      if (inlineMatch) {
        const raw = inlineMatch[1].trim();
        let tags = [];
        // Try JSON array first
        if (raw.startsWith("[")) {
          try {
            tags = JSON.parse(raw).map(String);
          } catch {
            tags = raw.replace(/[\[\]"]/g, "").split(/[\s,]+/).filter(Boolean);
          }
        } else {
          tags = raw.split(/\s+/).filter(Boolean);
        }
        for (const tag of tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }

      // Also handle YAML block list: lines starting with "  - tag" after "contains:"
      const blockMatch = fm.match(/^contains:\s*\n((?:\s+-\s+.+\n?)+)/m);
      if (!inlineMatch && blockMatch) {
        const listLines = blockMatch[1].match(/^\s+-\s+(.+)$/gm) || [];
        for (const line of listLines) {
          const tag = line.replace(/^\s+-\s+/, "").trim();
          if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
    }

    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Symbol lookup: FTS search for a symbol name, returning structured results
   * with file path and position extracted from chunk frontmatter.
   * Used as fallback when no LSP server is running.
   */
  symbols({ name, limit = 10 }) {
    const escaped = escapeFtsQuery(name);
    if (!escaped) return { results: [] };

    const rows = this.#db.prepare(`
      SELECT d.id, d.path, d.frontmatter, d.content
      FROM documents_fts f
      JOIN documents d ON d.id = f.id
      WHERE documents_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(escaped, limit * 4); // overfetch — we may skip rows with no source_path

    const seen = new Set();
    const results = [];

    for (const row of rows) {
      if (results.length >= limit) break;
      const fm = row.frontmatter || SqliteSearch.#extractFrontmatter(row.content) || "";
      const sourcePathMatch = fm.match(/^source_path:\s*(.+)$/m);
      const sourcePath = sourcePathMatch ? sourcePathMatch[1].trim() : null;
      const key = `${sourcePath ?? row.path}::${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        id: key,
        name,
        type: "unknown",
        file_path: sourcePath,
        chunk_path: row.path,
        line_start: null,
      });
    }

    return { results };
  }

  /**
   * Dependent files: find all files (by source_path) that mention the given name.
   * Purely FTS-based — no LSP required.
   */
  dependents({ name, limit = 20 }) {
    const escaped = escapeFtsQuery(name);
    if (!escaped) return { files: [] };

    const rows = this.#db.prepare(`
      SELECT d.frontmatter, d.content, d.path
      FROM documents_fts f
      JOIN documents d ON d.id = f.id
      WHERE documents_fts MATCH ?
      LIMIT ?
    `).all(escaped, limit * 5);

    const files = new Map(); // source_path → {file_path, chunk_path}
    for (const row of rows) {
      if (files.size >= limit) break;
      const fm = row.frontmatter || SqliteSearch.#extractFrontmatter(row.content) || "";
      const m = fm.match(/^source_path:\s*(.+)$/m);
      const sourcePath = m ? m[1].trim() : null;
      if (sourcePath && !files.has(sourcePath)) {
        files.set(sourcePath, row.path);
      }
    }

    return { files: [...files.keys()] };
  }

  /**
   * Retrieve logged search misses.
   * @param {object} opts
   * @param {number} [opts.limit=50]
   * @param {string} [opts.since] - ISO 8601 timestamp
   */
  searchMisses({ limit = 50, since = null } = {}) {
    const sinceClause = since ? `WHERE searched_at >= ?` : "";
    const sinceParams = since ? [new Date(since).getTime()] : [];
    return this.#db.prepare(`
      SELECT query, searched_at, session_id
      FROM search_misses
      ${sinceClause}
      ORDER BY searched_at DESC
      LIMIT ?
    `).all(...sinceParams, limit);
  }

  close() {
    this.#db.close();
  }
}
