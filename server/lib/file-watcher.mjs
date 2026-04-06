import { watch, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".venv", "venv",
  "target", "dist", "build", ".next", ".nuxt", "coverage",
  ".idea", ".vscode", ".vs", "bin", "obj", ".cache",
  ".gradle", ".mvn", ".terraform"
]);

export class FileWatcher {
  #brainPath;
  #db;
  #brainId;
  #hashes = new Map(); // path -> content hash
  #watchers = [];
  #debounceTimers = new Map();
  #pollInterval = null;
  #onChangeCallbacks = [];
  #projects = [];

  constructor(brainPath, db, brainId, projects = []) {
    this.#brainPath = brainPath;
    this.#db = db;
    this.#brainId = brainId;
    this.#projects = projects;
  }

  onFileChange(callback) {
    this.#onChangeCallbacks.push(callback);
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

    // Watch registered project directories
    for (const project of this.#projects) {
      if (!existsSync(project.path)) continue;
      this.#scanAndHashProject(project);
      try {
        const watcher = watch(project.path, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          const parts = filename.split(/[/\\]/);
          if (parts.some(p => IGNORE_DIRS.has(p))) return;
          const relPath = normalizePath(`projects/${project.name}/${filename}`);
          this.#debounce(relPath, () => this.#handleProjectChange(project, filename));
        });
        this.#watchers.push(watcher);
      } catch {
        // recursive watch not supported — polling fallback already handles this
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

  #scanAndHashProject(project) {
    this.#walkDir(project.path, (absPath) => {
      const parts = absPath.split(/[/\\]/);
      if (parts.some(p => IGNORE_DIRS.has(p))) return;
      if (!absPath.endsWith(".md") && !this.#isCodeFile(absPath)) return;
      const relPath = normalizePath(`projects/${project.name}/${relative(project.path, absPath)}`);
      const content = readFileSync(absPath, "utf-8");
      const hash = this.#hash(content);
      this.#hashes.set(relPath, hash);
    });
  }

  #walkDir(dir, callback) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        this.#walkDir(full, callback);
      }
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
        for (const cb of this.#onChangeCallbacks) {
          try { cb(relPath, absPath, null, "delete"); } catch {}
        }
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
      for (const cb of this.#onChangeCallbacks) {
        try { cb(relPath, absPath, content, "change"); } catch {}
      }
    } catch {
      // File might be mid-write, ignore
    }
  }

  #handleProjectChange(project, filename) {
    const absPath = join(project.path, filename);
    const relPath = normalizePath(`projects/${project.name}/${filename}`);

    if (!existsSync(absPath)) {
      if (this.#hashes.has(relPath)) {
        this.#hashes.delete(relPath);
        this.#db.remove(relPath);
        console.log(`[watcher] Removed from index: ${relPath}`);
        for (const cb of this.#onChangeCallbacks) {
          try { cb(relPath, absPath, null, "delete"); } catch {}
        }
      }
      return;
    }

    try {
      const content = readFileSync(absPath, "utf-8");
      const newHash = this.#hash(content);
      const oldHash = this.#hashes.get(relPath);
      if (newHash === oldHash) return;

      this.#hashes.set(relPath, newHash);
      this.#db.index({
        id: relPath,
        path: relPath,
        content,
        brain_id: this.#brainId,
      });
      console.log(`[watcher] Reindexed: ${relPath}`);
      for (const cb of this.#onChangeCallbacks) {
        try { cb(relPath, absPath, content, "change"); } catch {}
      }
    } catch {}
  }

  #isCodeFile(absPath) {
    const dot = absPath.lastIndexOf(".");
    if (dot === -1) return false;
    const ext = absPath.slice(dot);
    return ext.length <= 6;
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
