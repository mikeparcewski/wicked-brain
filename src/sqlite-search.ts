import Database from "better-sqlite3";
import * as fs from "node:fs";
import type { SearchAdapter } from "./search-adapter.js";
import type {
  IndexableDocument,
  SearchQuery,
  SearchResult,
  FederatedSearchResult,
  BacklinkEntry,
  IndexStats,
  BrainRef,
  SearchResultEntry,
  DeeperHint,
} from "./types.js";
import { parseWikilinks } from "./wikilinks.js";

export class SqliteSearch implements SearchAdapter {
  private db: Database.Database;
  private brainId: string;

  constructor(dbPath: string, brainId: string) {
    this.brainId = brainId;
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        id, path, content, brain_id,
        tokenize='porter unicode61'
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        frontmatter TEXT,
        brain_id TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS links (
        source_id TEXT NOT NULL,
        source_brain TEXT NOT NULL,
        target_path TEXT NOT NULL,
        target_brain TEXT,
        link_text TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);
      CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  async index(doc: IndexableDocument): Promise<void> {
    const indexDoc = this.db.transaction(() => {
      // Upsert into documents
      const upsert = this.db.prepare(`
        INSERT INTO documents (id, path, content, frontmatter, brain_id, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          path = excluded.path,
          content = excluded.content,
          frontmatter = excluded.frontmatter,
          brain_id = excluded.brain_id,
          indexed_at = excluded.indexed_at
      `);
      upsert.run(
        doc.id,
        doc.path,
        doc.content,
        JSON.stringify(doc.frontmatter),
        doc.brain_id,
        new Date().toISOString()
      );

      // Delete + insert into FTS
      this.db.prepare("DELETE FROM documents_fts WHERE id = ?").run(doc.id);
      this.db
        .prepare(
          "INSERT INTO documents_fts (id, path, content, brain_id) VALUES (?, ?, ?, ?)"
        )
        .run(doc.id, doc.path, doc.content, doc.brain_id);

      // Delete + insert links
      this.db.prepare("DELETE FROM links WHERE source_id = ?").run(doc.id);
      const insertLink = this.db.prepare(`
        INSERT INTO links (source_id, source_brain, target_path, target_brain, link_text)
        VALUES (?, ?, ?, ?, ?)
      `);
      const wikilinks = parseWikilinks(doc.content);
      for (const link of wikilinks) {
        insertLink.run(doc.id, doc.brain_id, link.path, link.brain, link.raw);
      }
    });

    indexDoc();
  }

  async remove(id: string): Promise<void> {
    const removeDoc = this.db.transaction(() => {
      this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
      this.db.prepare("DELETE FROM documents_fts WHERE id = ?").run(id);
      this.db.prepare("DELETE FROM links WHERE source_id = ?").run(id);
    });

    removeDoc();
  }

  async reindex(docs: IndexableDocument[]): Promise<void> {
    const reindexAll = this.db.transaction(() => {
      this.db.prepare("DELETE FROM documents").run();
      this.db.prepare("DELETE FROM documents_fts").run();
      this.db.prepare("DELETE FROM links").run();
    });

    reindexAll();

    for (const doc of docs) {
      await this.index(doc);
    }
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    const escapedQuery = this.escapeFts(query.query);

    // Count total matches
    const countRow = this.db
      .prepare(
        `SELECT COUNT(*) as total FROM documents_fts
         WHERE documents_fts MATCH ? AND brain_id = ?`
      )
      .get(escapedQuery, this.brainId) as { total: number } | undefined;

    const totalMatches = countRow?.total ?? 0;

    // Get paginated results with snippet
    const rows = this.db
      .prepare(
        `SELECT id, path, brain_id, rank,
                snippet(documents_fts, 2, '', '', '...', 32) AS summary
         FROM documents_fts
         WHERE documents_fts MATCH ? AND brain_id = ?
         ORDER BY rank
         LIMIT ? OFFSET ?`
      )
      .all(escapedQuery, this.brainId, limit + 1, offset) as Array<{
      id: string;
      path: string;
      brain_id: string;
      rank: number;
      summary: string;
    }>;

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const results: SearchResultEntry[] = pageRows.map((row) => ({
      brain: row.brain_id,
      path: row.path,
      score: Math.abs(row.rank),
      summary: row.summary,
    }));

    const deeper: DeeperHint[] = [];
    if (hasMore) {
      deeper.push({
        tool: "search",
        params: {
          query: query.query,
          limit,
          offset: offset + limit,
        },
      });
    }

    return {
      results,
      total_matches: totalMatches,
      showing: results.length,
      searched_brains: [this.brainId],
      unreachable_brains: [],
      deeper,
    };
  }

  async searchFederated(
    query: SearchQuery,
    brains: BrainRef[]
  ): Promise<FederatedSearchResult> {
    const limit = query.limit ?? 10;

    // Start with local search (no limit so we can merge)
    const localResult = await this.search({ ...query, limit: 1000, offset: 0 });

    const allResults: SearchResultEntry[] = [...localResult.results];
    const searchedBrains: string[] = [...localResult.searched_brains];
    const unreachableBrains: string[] = [];

    // Search accessible remote brains (skip "self")
    for (const brain of brains) {
      if (brain.relationship === "self" || !brain.accessible) continue;

      const dbPath = brain.path.endsWith(".brain.db")
        ? brain.path
        : `${brain.path}/.brain.db`;

      try {
        this.db.prepare(`ATTACH DATABASE ? AS remote_${brain.id}`).run(dbPath);
        try {
          const escapedQuery = this.escapeFts(query.query);
          const remoteRows = this.db
            .prepare(
              `SELECT id, path, brain_id, rank,
                      snippet(remote_${brain.id}.documents_fts, 2, '', '', '...', 32) AS summary
               FROM remote_${brain.id}.documents_fts
               WHERE remote_${brain.id}.documents_fts MATCH ?
               ORDER BY rank
               LIMIT 1000`
            )
            .all(escapedQuery) as Array<{
            id: string;
            path: string;
            brain_id: string;
            rank: number;
            summary: string;
          }>;

          for (const row of remoteRows) {
            allResults.push({
              brain: row.brain_id || brain.id,
              path: row.path,
              score: Math.abs(row.rank),
              summary: row.summary,
            });
          }
          searchedBrains.push(brain.id);
        } finally {
          this.db.prepare(`DETACH DATABASE remote_${brain.id}`).run();
        }
      } catch {
        unreachableBrains.push(brain.id);
      }
    }

    // Sort by score descending and apply limit
    allResults.sort((a, b) => b.score - a.score);
    const limited = allResults.slice(0, limit);

    return {
      results: limited,
      total_matches: allResults.length,
      showing: limited.length,
      searched_brains: searchedBrains,
      unreachable_brains: unreachableBrains,
      deeper: [],
    };
  }

  async backlinks(id: string): Promise<BacklinkEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT source_id, source_brain, link_text
         FROM links
         WHERE target_path = ?`
      )
      .all(id) as Array<{
      source_id: string;
      source_brain: string;
      link_text: string;
    }>;

    return rows.map((row) => ({
      source_path: row.source_id,
      source_brain: row.source_brain,
      link_text: row.link_text,
    }));
  }

  async forwardLinks(id: string): Promise<string[]> {
    const rows = this.db
      .prepare(
        `SELECT target_path FROM links WHERE source_id = ?`
      )
      .all(id) as Array<{ target_path: string }>;

    return rows.map((row) => row.target_path);
  }

  async stats(): Promise<IndexStats> {
    const totalDocs = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM documents")
        .get() as { count: number }
    ).count;

    const totalChunks = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM documents WHERE path LIKE 'chunks/%'")
        .get() as { count: number }
    ).count;

    const totalWiki = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM documents WHERE path LIKE 'wiki/%'")
        .get() as { count: number }
    ).count;

    const lastIndexedRow = this.db
      .prepare(
        "SELECT indexed_at FROM documents ORDER BY indexed_at DESC LIMIT 1"
      )
      .get() as { indexed_at: string } | undefined;

    const lastIndexed = lastIndexedRow?.indexed_at ?? "";

    const pageSizeRow = this.db
      .pragma("page_size") as Array<{ page_size: number }>;
    const pageCountRow = this.db
      .pragma("page_count") as Array<{ page_count: number }>;

    const pageSize = pageSizeRow[0]?.page_size ?? 4096;
    const pageCount = pageCountRow[0]?.page_count ?? 0;
    const dbSizeBytes = pageSize * pageCount;

    return {
      total_documents: totalDocs,
      total_chunks: totalChunks,
      total_wiki_articles: totalWiki,
      last_indexed: lastIndexed,
      index_size_bytes: dbSizeBytes,
    };
  }

  private escapeFts(query: string): string {
    return query
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w.replace(/"/g, '""')}"`)
      .join(" ");
  }
}
