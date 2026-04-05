/**
 * End-to-end integration test covering the full brain lifecycle.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrainHandle } from "../src/brain.js";
import { ingestFile } from "../src/ingest.js";
import { MetaBuilder } from "../src/meta-builder.js";
import { ProgressiveLoader } from "../src/progressive.js";
import { BrainPath } from "../src/brain-path.js";
import { resolveBrainRefs } from "../src/federation.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsbrain-integration-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const AI_KNOWLEDGE_GRAPH_CONTENT = `# AI and Knowledge Graphs

Artificial intelligence and knowledge graphs are increasingly intertwined.
Knowledge graphs provide structured representations of facts and relationships,
which AI systems can leverage for reasoning and question answering.

## What is a Knowledge Graph?

A knowledge graph is a semantic network that represents real-world entities and
the relationships between them. Unlike traditional databases, knowledge graphs
capture the context and meaning of data through ontologies and linked data
principles.

Popular knowledge graphs include Wikidata, DBpedia, and Google's Knowledge Graph.
These systems use RDF (Resource Description Framework) and SPARQL query language
to store and retrieve information.

## AI Applications

Large language models benefit from knowledge graphs in several ways:

1. **Grounding** — anchoring model outputs to verified facts
2. **Reasoning** — traversing graph edges to derive new knowledge
3. **Retrieval-augmented generation** — combining vector search with structured data

Neural-symbolic AI combines the pattern recognition of neural networks with the
logical reasoning capabilities of symbolic AI, bridging statistical and rule-based approaches.

## Future Directions

The intersection of AI and knowledge graphs is an active research area.
Graph neural networks (GNNs) can directly operate on graph-structured data,
enabling new forms of reasoning over interconnected knowledge.
`;

describe("Full brain lifecycle", () => {
  it("initializes a brain with correct structure and default templates", async () => {
    const brainDir = path.join(tmpDir, "test-brain");
    await BrainHandle.init(brainDir, { id: "integration-brain", name: "Integration Test Brain" });

    // Verify directory structure
    const expectedDirs = [
      brainDir,
      path.join(brainDir, "raw"),
      path.join(brainDir, "chunks", "extracted"),
      path.join(brainDir, "chunks", "inferred"),
      path.join(brainDir, "wiki"),
      path.join(brainDir, "_meta"),
      path.join(brainDir, "_ops"),
    ];
    for (const dir of expectedDirs) {
      const stat = await fsp.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    }

    // Verify default _ops/ templates were written
    const expectedTemplates = [
      "structure.md", "compile.md", "lint.md", "enhance.md", "query.md", "ingest.md",
    ];
    for (const template of expectedTemplates) {
      const templatePath = path.join(brainDir, "_ops", template);
      const stat = await fsp.stat(templatePath);
      expect(stat.isFile()).toBe(true);
      const content = await fsp.readFile(templatePath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    }

    // Verify brain.json
    const config = JSON.parse(
      await fsp.readFile(path.join(brainDir, "brain.json"), "utf-8")
    );
    expect(config.id).toBe("integration-brain");
    expect(config.name).toBe("Integration Test Brain");
  });

  it("ingests a markdown file and enables search", async () => {
    const brainDir = path.join(tmpDir, "test-brain");
    await BrainHandle.init(brainDir, { id: "integration-brain", name: "Integration Test Brain" });
    const brain = await BrainHandle.open(brainDir);

    try {
      // Write a raw source file
      const rawDir = path.join(brainDir, "raw");
      await fsp.writeFile(path.join(rawDir, "ai-knowledge-graphs.md"), AI_KNOWLEDGE_GRAPH_CONTENT, "utf-8");

      // Ingest it
      const result = await ingestFile(brain, "raw/ai-knowledge-graphs.md");
      expect(result.chunks_created).toBeGreaterThan(0);
      expect(result.skipped).not.toBe(true);

      // Search for content — FTS should work
      const aiResults = await brain.search.search({ query: "knowledge graph AI" });
      expect(aiResults.results.length).toBeGreaterThan(0);

      const rdfResults = await brain.search.search({ query: "RDF SPARQL" });
      expect(rdfResults.results.length).toBeGreaterThan(0);
    } finally {
      brain.close();
    }
  });

  it("progressive read at depth 0 returns metadata only (no content)", async () => {
    const brainDir = path.join(tmpDir, "test-brain");
    await BrainHandle.init(brainDir, { id: "integration-brain", name: "Integration Test Brain" });
    const brain = await BrainHandle.open(brainDir);

    try {
      const rawDir = path.join(brainDir, "raw");
      await fsp.writeFile(path.join(rawDir, "ai-knowledge-graphs.md"), AI_KNOWLEDGE_GRAPH_CONTENT, "utf-8");
      const ingestResult = await ingestFile(brain, "raw/ai-knowledge-graphs.md");
      expect(ingestResult.chunks_created).toBeGreaterThan(0);

      // Find an ingested chunk
      const chunkDir = path.join(brainDir, "chunks", "extracted");
      const sourceDirs = await fsp.readdir(chunkDir);
      expect(sourceDirs.length).toBeGreaterThan(0);
      const chunkFiles = await fsp.readdir(path.join(chunkDir, sourceDirs[0]));
      const firstChunkRelPath = `chunks/extracted/${sourceDirs[0]}/${chunkFiles[0]}`;

      const loader = new ProgressiveLoader(brain);
      const result = await loader.read(BrainPath.from(firstChunkRelPath), 0);

      // depth=0: no content, truncated=true
      expect(result.content).toBeUndefined();
      expect(result.truncated).toBe(true);
      expect(result.word_count).toBeGreaterThan(0);
      expect(result.frontmatter).toBeDefined();
    } finally {
      brain.close();
    }
  });

  it("progressive read at depth 2 returns full content", async () => {
    const brainDir = path.join(tmpDir, "test-brain");
    await BrainHandle.init(brainDir, { id: "integration-brain", name: "Integration Test Brain" });
    const brain = await BrainHandle.open(brainDir);

    try {
      const rawDir = path.join(brainDir, "raw");
      await fsp.writeFile(path.join(rawDir, "ai-knowledge-graphs.md"), AI_KNOWLEDGE_GRAPH_CONTENT, "utf-8");
      await ingestFile(brain, "raw/ai-knowledge-graphs.md");

      // Find an ingested chunk
      const chunkDir = path.join(brainDir, "chunks", "extracted");
      const sourceDirs = await fsp.readdir(chunkDir);
      const chunkFiles = await fsp.readdir(path.join(chunkDir, sourceDirs[0]));
      const firstChunkRelPath = `chunks/extracted/${sourceDirs[0]}/${chunkFiles[0]}`;

      const loader = new ProgressiveLoader(brain);
      const result = await loader.read(BrainPath.from(firstChunkRelPath), 2);

      // depth=2: full content returned
      expect(result.content).toBeDefined();
      expect((result.content as string).length).toBeGreaterThan(0);
      expect(result.frontmatter).toBeDefined();
    } finally {
      brain.close();
    }
  });

  it("rebuilds meta and creates orientation.md with chunk counts", async () => {
    const brainDir = path.join(tmpDir, "test-brain");
    await BrainHandle.init(brainDir, { id: "integration-brain", name: "Integration Test Brain" });
    const brain = await BrainHandle.open(brainDir);

    try {
      const rawDir = path.join(brainDir, "raw");
      await fsp.writeFile(path.join(rawDir, "ai-knowledge-graphs.md"), AI_KNOWLEDGE_GRAPH_CONTENT, "utf-8");
      const ingestResult = await ingestFile(brain, "raw/ai-knowledge-graphs.md");

      const metaBuilder = new MetaBuilder(
        path.join(brainDir, "_meta"),
        brain.eventLog
      );
      await metaBuilder.rebuild();

      // orientation.md should exist with chunk stats
      const orientationPath = path.join(brainDir, "_meta", "orientation.md");
      const stat = await fsp.stat(orientationPath);
      expect(stat.isFile()).toBe(true);

      const orientation = await fsp.readFile(orientationPath, "utf-8");
      expect(orientation).toContain("Brain Orientation");
      expect(orientation).toContain("Chunks");

      // Chunk count should be non-zero
      const chunkMatch = orientation.match(/\*\*Chunks\*\*:\s*(\d+)/);
      expect(chunkMatch).not.toBeNull();
      const chunkCount = parseInt(chunkMatch![1], 10);
      expect(chunkCount).toBe(ingestResult.chunks_created);
    } finally {
      brain.close();
    }
  });

  it("re-ingesting unchanged file is skipped", async () => {
    const brainDir = path.join(tmpDir, "test-brain");
    await BrainHandle.init(brainDir, { id: "integration-brain", name: "Integration Test Brain" });
    const brain = await BrainHandle.open(brainDir);

    try {
      const rawDir = path.join(brainDir, "raw");
      await fsp.writeFile(path.join(rawDir, "ai-knowledge-graphs.md"), AI_KNOWLEDGE_GRAPH_CONTENT, "utf-8");

      // First ingest
      const first = await ingestFile(brain, "raw/ai-knowledge-graphs.md");
      expect(first.chunks_created).toBeGreaterThan(0);
      expect(first.skipped).not.toBe(true);

      // Re-ingest same file — should skip
      const second = await ingestFile(brain, "raw/ai-knowledge-graphs.md");
      expect(second.skipped).toBe(true);
      expect(second.chunks_created).toBe(0);
    } finally {
      brain.close();
    }
  });

  it("federated search finds parent brain content", async () => {
    const parentDir = path.join(tmpDir, "parent-brain");
    const childDir = path.join(tmpDir, "child-brain");

    // Init and populate parent brain
    await BrainHandle.init(parentDir, { id: "parent-brain", name: "Parent Brain" });
    const parentBrain = await BrainHandle.open(parentDir);

    try {
      const rawDir = path.join(parentDir, "raw");
      await fsp.mkdir(rawDir, { recursive: true });
      await fsp.writeFile(
        path.join(rawDir, "ai-knowledge-graphs.md"),
        AI_KNOWLEDGE_GRAPH_CONTENT,
        "utf-8"
      );
      await ingestFile(parentBrain, "raw/ai-knowledge-graphs.md");

      // Search works in parent
      const parentResults = await parentBrain.search.search({ query: "knowledge graph" });
      expect(parentResults.results.length).toBeGreaterThan(0);
    } finally {
      parentBrain.close();
    }

    // Init child with parent reference
    const relativeParentPath = path.relative(childDir, parentDir);
    await BrainHandle.init(childDir, {
      id: "child-brain",
      name: "Child Brain",
      parents: [relativeParentPath],
    });

    const childBrain = await BrainHandle.open(childDir);

    try {
      // Resolve federation refs
      const refs = await resolveBrainRefs(childBrain);
      expect(refs).toHaveLength(2);

      const parentRef = refs.find((r) => r.relationship === "parent");
      expect(parentRef).toBeDefined();
      expect(parentRef!.accessible).toBe(true);
      expect(parentRef!.id).toBe("parent-brain");

      // Open parent via federation ref and search its content
      const federatedParent = await BrainHandle.open(parentRef!.path);
      try {
        const federatedResults = await federatedParent.search.search({
          query: "neural network knowledge",
        });
        expect(federatedResults.results.length).toBeGreaterThan(0);
      } finally {
        federatedParent.close();
      }
    } finally {
      childBrain.close();
    }
  });
});
