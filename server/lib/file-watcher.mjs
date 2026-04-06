import { watch, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

export class FileWatcher {
  #brainPath;
  #db;
  #brainId;
  #hashes = new Map(); // path -> content hash
  #watchers = [];
  #debounceTimers = new Map();
  #pollInterval = null;

  constructor(brainPath, db, brainId) {
    this.#brainPath = brainPath;
    this.#db = db;
    this.#brainId = brainId;
  }

  start() {
    // Build initial hash map
    this.#scanAndHash("chunks");
    this.#scanAndHash("wiki");
    this.#scanAndHash("memory");

    // Watch directories
    for (const dir of ["chunks", "wiki", "memory"]) {
      const absDir = join(this.#brainPath, dir);
      if (!existsSync(absDir)) continue;

      try {
        const watcher = watch(absDir, { recursive: true }, (eventType, filename) => {
          if (!filename || !filename.endsWith(".md")) return;
          const relPath = normalizePath(`${dir}/${filename}`);
          this.#debounce(relPath, () => this.#handleChange(relPath));
        });
        this.#watchers.push(watcher);
      } catch {
        // recursive watch not supported on this platform (Linux) — fall back to polling
      }
    }

    // If no watchers were set up (Linux), use polling fallback
    if (this.#watchers.length === 0) {
      this.#startPolling();
    } else {
      console.log(`File watcher active on chunks/, wiki/, and memory/`);
    }
  }

  stop() {
    for (const w of this.#watchers) w.close();
    this.#watchers = [];
    for (const t of this.#debounceTimers.values()) clearTimeout(t);
    this.#debounceTimers.clear();
    if (this.#pollInterval) { clearInterval(this.#pollInterval); this.#pollInterval = null; }
  }

  // Scan a directory, hash all .md files, index any not yet in the DB
  #scanAndHash(dir) {
    const absDir = join(this.#brainPath, dir);
    if (!existsSync(absDir)) return;
    this.#walkDir(absDir, (absPath) => {
      if (!absPath.endsWith(".md")) return;
      const relPath = normalizePath(relative(this.#brainPath, absPath));
      const content = readFileSync(absPath, "utf-8");
      const hash = this.#hash(content);
      this.#hashes.set(relPath, hash);
    });
  }

  #walkDir(dir, callback) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) this.#walkDir(full, callback);
      else if (entry.isFile()) callback(full);
    }
  }

  #handleChange(relPath) {
    const absPath = join(this.#brainPath, relPath);

    if (!existsSync(absPath)) {
      // File deleted
      if (this.#hashes.has(relPath)) {
        this.#hashes.delete(relPath);
        this.#db.remove(relPath);
        console.log(`[watcher] Removed from index: ${relPath}`);
      }
      return;
    }

    try {
      const content = readFileSync(absPath, "utf-8");
      const newHash = this.#hash(content);
      const oldHash = this.#hashes.get(relPath);

      if (newHash === oldHash) return; // No change

      this.#hashes.set(relPath, newHash);
      this.#db.index({
        id: relPath,
        path: relPath,
        content: content,
        brain_id: this.#brainId,
      });
      console.log(`[watcher] Reindexed: ${relPath}`);
    } catch {
      // File might be mid-write, ignore
    }
  }

  #startPolling() {
    console.log("File watcher using polling mode (recursive watch not available)");
    this.#pollInterval = setInterval(() => {
      for (const dir of ["chunks", "wiki", "memory"]) {
        const absDir = join(this.#brainPath, dir);
        if (!existsSync(absDir)) continue;
        this.#walkDir(absDir, (absPath) => {
          if (!absPath.endsWith(".md")) return;
          const relPath = normalizePath(relative(this.#brainPath, absPath));
          try {
            const content = readFileSync(absPath, "utf-8");
            const newHash = this.#hash(content);
            const oldHash = this.#hashes.get(relPath);
            if (newHash !== oldHash) {
              this.#hashes.set(relPath, newHash);
              this.#db.index({ id: relPath, path: relPath, content, brain_id: this.#brainId });
              console.log(`[watcher] Reindexed: ${relPath}`);
            }
          } catch {}
        });
      }
      // Check for deletions
      for (const [relPath] of this.#hashes) {
        if (!existsSync(join(this.#brainPath, relPath))) {
          this.#hashes.delete(relPath);
          this.#db.remove(relPath);
          console.log(`[watcher] Removed from index: ${relPath}`);
        }
      }
    }, 3000);
  }

  #debounce(key, fn) {
    if (this.#debounceTimers.has(key)) clearTimeout(this.#debounceTimers.get(key));
    this.#debounceTimers.set(key, setTimeout(() => {
      this.#debounceTimers.delete(key);
      fn();
    }, 500)); // 500ms debounce
  }

  #hash(content) {
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
}
