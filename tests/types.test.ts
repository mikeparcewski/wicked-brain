import { describe, it, expect } from "vitest";
import {
  CURRENT_SCHEMA,
  type ModelConfig,
  type BrainConfig,
  type WriteOp,
  type WriteReceipt,
  type BatchResult,
  type FileStat,
  type LogEntry,
  type LogWriteEntry,
  type LogDeleteEntry,
  type LogTagEntry,
  type LogLinkEntry,
  type ChunkEntities,
  type ChunkFrontmatter,
  type DeeperHint,
  type SearchResultEntry,
  type SearchResult,
  type FederatedSearchResult,
  type SearchQuery,
  type IndexableDocument,
  type BacklinkEntry,
  type IndexStats,
  type BrainRef,
} from "../src/types.js";

describe("CURRENT_SCHEMA", () => {
  it("is 1", () => {
    expect(CURRENT_SCHEMA).toBe(1);
  });
});

describe("Core types compile and have correct shapes", () => {
  it("ModelConfig shape", () => {
    const m: ModelConfig = { provider: "openai", model: "gpt-4" };
    expect(m.provider).toBe("openai");
    expect(m.model).toBe("gpt-4");
  });

  it("BrainConfig shape", () => {
    const config: BrainConfig = {
      schema: CURRENT_SCHEMA,
      id: "brain-001",
      name: "My Brain",
      parents: [],
      links: [],
      plugins: [],
      models: {
        default: { provider: "anthropic", model: "claude-3" },
      },
    };
    expect(config.schema).toBe(1);
    expect(config.id).toBe("brain-001");
  });

  it("WriteOp shape", () => {
    const op: WriteOp = { path: "notes/foo.md", content: "hello" };
    expect(op.path).toBe("notes/foo.md");
  });

  it("WriteReceipt shape", () => {
    const receipt: WriteReceipt = {
      path: "notes/foo.md",
      content_hash: "abc123",
      written_at: new Date().toISOString(),
    };
    expect(receipt.content_hash).toBe("abc123");
  });

  it("BatchResult shape", () => {
    const result: BatchResult = {
      receipts: [{ path: "a.md", content_hash: "h1", written_at: "2026-01-01T00:00:00Z" }],
      failed: [{ path: "b.md", error: "permission denied" }],
    };
    expect(result.receipts).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
  });

  it("FileStat shape", () => {
    const stat: FileStat = {
      size: 1024,
      modified_at: "2026-01-01T00:00:00Z",
      is_directory: false,
      is_symlink: false,
    };
    expect(stat.size).toBe(1024);
  });

  it("LogWriteEntry discriminated union", () => {
    const entry: LogEntry = {
      ts: "2026-01-01T00:00:00Z",
      op: "write",
      path: "notes/foo.md",
      author: "agent-1",
      content_hash: "abc",
    };
    expect(entry.op).toBe("write");
    if (entry.op === "write") {
      const typed: LogWriteEntry = entry;
      expect(typed.author).toBe("agent-1");
    }
  });

  it("LogDeleteEntry discriminated union", () => {
    const entry: LogEntry = {
      ts: "2026-01-01T00:00:00Z",
      op: "delete",
      path: "notes/foo.md",
      author: "agent-1",
    };
    expect(entry.op).toBe("delete");
    if (entry.op === "delete") {
      const typed: LogDeleteEntry = entry;
      expect(typed.path).toBe("notes/foo.md");
    }
  });

  it("LogTagEntry discriminated union", () => {
    const entry: LogEntry = {
      ts: "2026-01-01T00:00:00Z",
      op: "tag",
      path: "notes/foo.md",
      author: "agent-1",
      tags: ["important", "review"],
    };
    expect(entry.op).toBe("tag");
    if (entry.op === "tag") {
      const typed: LogTagEntry = entry;
      expect(typed.tags).toContain("important");
    }
  });

  it("LogLinkEntry discriminated union", () => {
    const entry: LogEntry = {
      ts: "2026-01-01T00:00:00Z",
      op: "link",
      from: "notes/a.md",
      to: "notes/b.md",
      link_type: "references",
      author: "agent-1",
    };
    expect(entry.op).toBe("link");
    if (entry.op === "link") {
      const typed: LogLinkEntry = entry;
      expect(typed.link_type).toBe("references");
    }
  });

  it("ChunkFrontmatter shape", () => {
    const entities: ChunkEntities = {
      systems: ["sys-a"],
      people: ["Alice"],
      programs: [],
      metrics: ["revenue"],
    };
    const frontmatter: ChunkFrontmatter = {
      source: "doc.pdf",
      source_type: "pdf",
      chunk_id: "chunk-001",
      content_type: ["text"],
      contains: ["summary"],
      entities,
      confidence: 0.95,
      indexed_at: "2026-01-01T00:00:00Z",
    };
    expect(frontmatter.source_type).toBe("pdf");
    expect(frontmatter.confidence).toBe(0.95);
  });

  it("SearchResult shape", () => {
    const entry: SearchResultEntry = { brain: "brain-1", path: "notes/a.md", score: 0.9, summary: "test" };
    const result: SearchResult = {
      results: [entry],
      total_matches: 1,
      showing: 1,
      searched_brains: ["brain-1"],
      unreachable_brains: [],
      deeper: [],
    };
    expect(result.total_matches).toBe(1);
  });

  it("FederatedSearchResult extends SearchResult", () => {
    const fed: FederatedSearchResult = {
      results: [],
      total_matches: 0,
      showing: 0,
      searched_brains: [],
      unreachable_brains: [],
      deeper: [],
    };
    expect(fed.total_matches).toBe(0);
  });

  it("SearchQuery shape", () => {
    const query: SearchQuery = { query: "test query", limit: 10 };
    expect(query.query).toBe("test query");
  });

  it("IndexableDocument shape", () => {
    const doc: IndexableDocument = {
      id: "doc-1",
      path: "notes/a.md",
      content: "hello world",
      frontmatter: {},
      brain_id: "brain-1",
    };
    expect(doc.brain_id).toBe("brain-1");
  });

  it("BacklinkEntry shape", () => {
    const bl: BacklinkEntry = { source_path: "notes/b.md", source_brain: "brain-1", link_text: "see also" };
    expect(bl.link_text).toBe("see also");
  });

  it("IndexStats shape", () => {
    const stats: IndexStats = {
      total_documents: 100,
      total_chunks: 500,
      total_wiki_articles: 20,
      last_indexed: "2026-01-01T00:00:00Z",
      index_size_bytes: 1048576,
    };
    expect(stats.total_documents).toBe(100);
  });

  it("BrainRef shape with all relationships", () => {
    const self: BrainRef = { id: "b1", path: "/brain1", relationship: "self", accessible: true };
    const parent: BrainRef = { id: "b2", path: "/brain2", relationship: "parent", accessible: true };
    const link: BrainRef = { id: "b3", path: "/brain3", relationship: "link", accessible: false };
    expect(self.relationship).toBe("self");
    expect(parent.relationship).toBe("parent");
    expect(link.accessible).toBe(false);
  });

  it("DeeperHint shape", () => {
    const hint: DeeperHint = { tool: "semantic-search", params: { threshold: 0.8 } };
    expect(hint.tool).toBe("semantic-search");
  });
});
