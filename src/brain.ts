import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BrainConfig } from "./types.js";
import { CURRENT_SCHEMA } from "./types.js";
import type { StorageAdapter } from "./storage-adapter.js";
import { LocalFsStorage } from "./fs-storage.js";
import { SqliteSearch } from "./sqlite-search.js";
import { EventLog } from "./event-log.js";
import { BrainLock } from "./brain-lock.js";
import { getMigrations } from "./migrations.js";

/** Default _ops/ templates shipped with the package */
const DEFAULT_OPS_TEMPLATES: Record<string, string> = {
  "structure.md": `You are a knowledge structuring agent for a digital brain.

## Your task
Read newly ingested chunks and enrich their metadata through reasoning.

## For each chunk, determine:
1. **Tags** — semantic classification within this brain's existing taxonomy.
   Read brain_status first to understand what tags exist.
2. **Entities** — systems, people, organizations, metrics. Not keyword
   extraction — reason about what's actually being discussed.
3. **Narrative theme** — the "so what" in 8 words or fewer.
4. **Connections** — what existing chunks/articles relate? Use brain_search
   to find them. Create [[backlinks]] where appropriate.
5. **Cross-brain links** — if content relates to a linked brain,
   use [[brain-id::path]] syntax.

## Rules
- Always brain_status depth=1 first to orient yourself
- Always brain_search before assigning tags to align with existing taxonomy
- Write enriched frontmatter back via brain_write
- Do not invent entities that aren't in the source text
- Assign confidence based on how clear the source material is
`,
  "compile.md": `You are a knowledge compilation agent for a digital brain.

## Your task
Review chunks in the brain and synthesize wiki articles that capture key concepts.

## Process
1. Use brain_status to understand what exists
2. Use brain_search to find chunks without wiki coverage
3. Identify concept clusters — groups of chunks about the same topic
4. Write wiki articles with [[backlinks]] to source chunks
5. Use brain_write to save articles to wiki/concepts/ or wiki/topics/

## Rules
- Every claim must link to a source chunk
- Use [[chunk-path]] backlinks for attribution
- Set authored_by: llm in frontmatter
- Include source_chunks list in frontmatter
- Don't duplicate existing wiki articles — extend them
`,
  "lint.md": `You are a quality assurance agent for a digital brain.

## Your task
Find and fix inconsistencies, gaps, and quality issues.

## Check for
1. Factual inconsistencies across wiki articles
2. Tags used inconsistently for the same concept
3. Missing connections between related content
4. Outdated claims contradicted by newer sources
5. Wiki articles with no source chunk backing

## Rules
- Use brain_search to cross-reference claims
- Fix auto-fixable issues via brain_write
- Report unfixable issues as suggestions
- Don't delete content — mark it as stale if outdated
`,
  "enhance.md": `You are a knowledge enhancement agent for a digital brain.

## Your task
Identify and fill gaps in the brain's knowledge.

## Process
1. Read brain_status depth=2 to see gaps.md
2. Search for thin areas — topics with few chunks
3. Reason about what's missing
4. Write new inferred chunks to chunks/inferred/

## Rules
- Set authored_by: llm and lower confidence (0.5-0.7) for inferred content
- Always include source_chunks showing what existing content informed the inference
- Don't fabricate facts — synthesize from what exists
`,
  "query.md": `You are a query and research agent for a digital brain.

## Your task
Answer questions by searching and synthesizing brain content.

## Process
1. Use brain_status depth=0 to orient
2. Use brain_search to find relevant content
3. Use brain_read at depth 1 first, then depth 2 for promising results
4. Follow backlinks and forward links for context
5. Synthesize an answer with source attribution

## Rules
- Always cite source paths for claims
- If you can't find enough evidence, say so
- Use brain_resolve for cross-brain links
- Search linked brains if local results are insufficient
`,
  "ingest.md": `You are an ingestion structuring agent. After deterministic extraction creates raw chunks,
you enrich their metadata. This is equivalent to the structure operation — use the same approach.
`,
};

export class BrainHandle {
  readonly root: string;
  readonly storage: StorageAdapter;
  readonly search: SqliteSearch;
  readonly eventLog: EventLog;
  readonly lock: BrainLock;
  private _config: BrainConfig;

  private constructor(
    root: string,
    storage: StorageAdapter,
    search: SqliteSearch,
    eventLog: EventLog,
    lock: BrainLock,
    config: BrainConfig
  ) {
    this.root = root;
    this.storage = storage;
    this.search = search;
    this.eventLog = eventLog;
    this.lock = lock;
    this._config = config;
  }

  /**
   * Initializes a new brain at brainDir.
   * Creates the directory structure and brain.json.
   */
  static async init(
    brainDir: string,
    opts: {
      id: string;
      name: string;
      parents?: string[];
      links?: string[];
      plugins?: string[];
      models?: Record<string, { provider: string; model: string }>;
    }
  ): Promise<void> {
    // Create all required directories
    const dirs = [
      brainDir,
      path.join(brainDir, "raw"),
      path.join(brainDir, "chunks", "extracted"),
      path.join(brainDir, "chunks", "inferred"),
      path.join(brainDir, "wiki"),
      path.join(brainDir, "_meta"),
      path.join(brainDir, "_ops"),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    const config: BrainConfig = {
      schema: CURRENT_SCHEMA,
      id: opts.id,
      name: opts.name,
      parents: opts.parents ?? [],
      links: opts.links ?? [],
      plugins: opts.plugins ?? [],
      models: opts.models ?? {},
    };

    const configPath = path.join(brainDir, "brain.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    // Write default _ops/ templates
    const opsDir = path.join(brainDir, "_ops");
    for (const [filename, content] of Object.entries(DEFAULT_OPS_TEMPLATES)) {
      await fs.writeFile(path.join(opsDir, filename), content, "utf-8");
    }
  }

  /**
   * Opens an existing brain at brainDir.
   * Reads brain.json, runs any needed migrations, and initializes all adapters.
   */
  static async open(brainDir: string): Promise<BrainHandle> {
    const configPath = path.join(brainDir, "brain.json");

    let configContent: string;
    try {
      configContent = await fs.readFile(configPath, "utf-8");
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        throw new Error(`No brain.json found at: ${brainDir}`);
      }
      throw err;
    }

    const config = JSON.parse(configContent) as BrainConfig;

    // Run migrations if needed
    const migrations = getMigrations(config.schema);
    for (const migrate of migrations) {
      await migrate(brainDir);
    }
    // Update schema in config after migrations
    if (migrations.length > 0) {
      config.schema = CURRENT_SCHEMA;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    }

    const storage = new LocalFsStorage(brainDir);
    const search = new SqliteSearch(
      path.join(brainDir, ".brain.db"),
      config.id
    );
    const eventLog = new EventLog(path.join(brainDir, "_ops", "log.jsonl"));
    const lock = new BrainLock(brainDir);

    return new BrainHandle(brainDir, storage, search, eventLog, lock, config);
  }

  config(): BrainConfig {
    return this._config;
  }

  close(): void {
    this.search.close();
  }
}
