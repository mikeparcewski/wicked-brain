import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SqliteSearch } from "./sqlite-search.js";
import type { IndexableDocument } from "./types.js";

function makeDoc(overrides: Partial<IndexableDocument> = {}): IndexableDocument {
  return {
    id: "doc-1",
    path: "wiki/test.md",
    content: "Hello world, this is a test document.",
    frontmatter: {},
    brain_id: "brain-a",
    ...overrides,
  };
}

let tmpDir: string;
let search: SqliteSearch;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-test-"));
  search = new SqliteSearch(path.join(tmpDir, "test.brain.db"), "brain-a");
});

afterEach(() => {
  search.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("SqliteSearch", () => {
  it("indexes and searches a document (FTS match)", async () => {
    const doc = makeDoc();
    await search.index(doc);

    const result = await search.search({ query: "Hello world" });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].path).toBe("wiki/test.md");
    expect(result.results[0].brain).toBe("brain-a");
    expect(result.results[0].score).toBeGreaterThan(0);
    expect(result.total_matches).toBe(1);
    expect(result.searched_brains).toContain("brain-a");
    expect(result.unreachable_brains).toHaveLength(0);
  });

  it("removes a document from index", async () => {
    const doc = makeDoc();
    await search.index(doc);

    // Verify it's indexed
    let result = await search.search({ query: "Hello world" });
    expect(result.total_matches).toBe(1);

    // Remove it
    await search.remove(doc.id);

    // Should no longer be found
    result = await search.search({ query: "Hello world" });
    expect(result.total_matches).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it("respects limit and offset (index 5 docs, query with limit 2)", async () => {
    for (let i = 1; i <= 5; i++) {
      await search.index(
        makeDoc({
          id: `doc-${i}`,
          path: `wiki/doc-${i}.md`,
          content: `Unique searchable content document number ${i}`,
        })
      );
    }

    const result = await search.search({ query: "searchable content", limit: 2, offset: 0 });

    expect(result.results.length).toBe(2);
    expect(result.showing).toBe(2);
    expect(result.total_matches).toBe(5);

    // Page 2
    const result2 = await search.search({ query: "searchable content", limit: 2, offset: 2 });
    expect(result2.results.length).toBe(2);
    expect(result2.showing).toBe(2);
  });

  it("tracks backlinks (index doc with [[link]], query backlinks for that target)", async () => {
    const doc = makeDoc({
      id: "source-doc",
      path: "wiki/source.md",
      content: "See [[wiki/target.md]] for more info.",
    });
    await search.index(doc);

    const backlinks = await search.backlinks("wiki/target.md");

    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].source_path).toBe("source-doc");
    expect(backlinks[0].source_brain).toBe("brain-a");
    expect(backlinks[0].link_text).toBe("[[wiki/target.md]]");
  });

  it("tracks forward links", async () => {
    const doc = makeDoc({
      id: "source-doc",
      path: "wiki/source.md",
      content: "Links to [[wiki/page-a.md]] and [[wiki/page-b.md]].",
    });
    await search.index(doc);

    const forwardLinks = await search.forwardLinks("source-doc");

    expect(forwardLinks).toHaveLength(2);
    expect(forwardLinks).toContain("wiki/page-a.md");
    expect(forwardLinks).toContain("wiki/page-b.md");
  });

  it("returns index stats (total_documents, total_chunks, total_wiki_articles)", async () => {
    await search.index(makeDoc({ id: "wiki-1", path: "wiki/article.md", content: "A wiki article about knowledge." }));
    await search.index(makeDoc({ id: "chunk-1", path: "chunks/chunk-001.md", content: "A chunk of ingested content." }));
    await search.index(makeDoc({ id: "chunk-2", path: "chunks/chunk-002.md", content: "Another chunk of ingested content." }));

    const stats = await search.stats();

    expect(stats.total_documents).toBe(3);
    expect(stats.total_chunks).toBe(2);
    expect(stats.total_wiki_articles).toBe(1);
    expect(stats.last_indexed).toBeTruthy();
    expect(stats.index_size_bytes).toBeGreaterThan(0);
  });

  it("reindexes replacing all documents", async () => {
    // Index initial docs
    await search.index(makeDoc({ id: "old-doc", path: "wiki/old.md", content: "Old document content." }));

    let result = await search.search({ query: "Old document" });
    expect(result.total_matches).toBe(1);

    // Reindex with new docs
    const newDocs = [
      makeDoc({ id: "new-1", path: "wiki/new-a.md", content: "Fresh new content here." }),
      makeDoc({ id: "new-2", path: "wiki/new-b.md", content: "Another fresh new document." }),
    ];
    await search.reindex(newDocs);

    // Old doc should be gone
    result = await search.search({ query: "Old document" });
    expect(result.total_matches).toBe(0);

    // New docs should be present
    result = await search.search({ query: "fresh new" });
    expect(result.total_matches).toBe(2);
  });

  it("search returns DeeperHint when more results available", async () => {
    for (let i = 1; i <= 5; i++) {
      await search.index(
        makeDoc({
          id: `doc-${i}`,
          path: `wiki/doc-${i}.md`,
          content: `Important searchable information document ${i}`,
        })
      );
    }

    const result = await search.search({ query: "searchable information", limit: 3, offset: 0 });

    expect(result.results.length).toBe(3);
    expect(result.deeper).toHaveLength(1);
    expect(result.deeper[0].tool).toBe("search");
    expect(result.deeper[0].params).toMatchObject({
      query: "searchable information",
      limit: 3,
      offset: 3,
    });
  });

  it("search returns no DeeperHint when all results fit in one page", async () => {
    await search.index(makeDoc());

    const result = await search.search({ query: "Hello world", limit: 10 });

    expect(result.deeper).toHaveLength(0);
  });
});
