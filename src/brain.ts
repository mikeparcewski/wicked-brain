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
