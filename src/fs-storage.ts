import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { StorageAdapter } from "./storage-adapter.js";
import type { WriteReceipt, BatchResult, WriteOp, FileStat } from "./types.js";
import { BrainPath } from "./brain-path.js";
import { contentHash } from "./hasher.js";

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

export class LocalFsStorage implements StorageAdapter {
  readonly root: string;

  constructor(brainRoot: string) {
    this.root = brainRoot;
  }

  async read(p: BrainPath): Promise<string> {
    return fs.readFile(p.resolve(this.root), "utf-8");
  }

  async write(
    p: BrainPath,
    content: string,
    opts?: { expectedHash?: string }
  ): Promise<WriteReceipt> {
    const absPath = p.resolve(this.root);

    if (opts?.expectedHash !== undefined) {
      let existingHash: string | null = null;
      try {
        const existing = await fs.readFile(absPath, "utf-8");
        existingHash = contentHash(existing);
      } catch (err: unknown) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code !== "ENOENT") throw err;
        // ENOENT: file doesn't exist yet — not a conflict
      }
      if (existingHash !== null && existingHash !== opts.expectedHash) {
        throw new Error("Write conflict");
      }
    }

    const dir = path.dirname(absPath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = absPath + ".tmp";
    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, absPath);

    return {
      path: p.toString(),
      content_hash: contentHash(content),
      written_at: new Date().toISOString(),
    };
  }

  async delete(p: BrainPath): Promise<void> {
    await fs.unlink(p.resolve(this.root));
  }

  async exists(p: BrainPath): Promise<boolean> {
    try {
      await fs.access(p.resolve(this.root));
      return true;
    } catch {
      return false;
    }
  }

  async list(
    dir: BrainPath,
    opts?: { pattern?: string; recursive?: boolean }
  ): Promise<BrainPath[]> {
    const results: BrainPath[] = [];
    const patternRegex = opts?.pattern ? globToRegex(opts.pattern) : null;

    const walk = async (currentDir: BrainPath): Promise<void> => {
      const absDir = currentDir.resolve(this.root);
      let entries: import("node:fs").Dirent<string>[];
      try {
        entries = await fs.readdir(absDir, { withFileTypes: true, encoding: "utf-8" });
      } catch {
        return;
      }

      for (const entry of entries) {
        const childPath = currentDir.join(entry.name);
        if (entry.isDirectory()) {
          if (opts?.recursive) {
            await walk(childPath);
          }
        } else if (entry.isFile()) {
          if (!patternRegex || patternRegex.test(entry.name)) {
            results.push(childPath);
          }
        }
      }
    };

    await walk(dir);
    return results;
  }

  async mkdir(dir: BrainPath): Promise<void> {
    await fs.mkdir(dir.resolve(this.root), { recursive: true });
  }

  async stat(p: BrainPath): Promise<FileStat> {
    const stats = await fs.lstat(p.resolve(this.root));
    return {
      size: stats.size,
      modified_at: stats.mtime.toISOString(),
      is_directory: stats.isDirectory(),
      is_symlink: stats.isSymbolicLink(),
    };
  }

  async batch(ops: WriteOp[]): Promise<BatchResult> {
    // Write-ahead log
    const pendingPath = BrainPath.from("_meta/pending.json");
    const pendingContent = JSON.stringify({ paths: ops.map((o) => o.path) });
    await this.write(pendingPath, pendingContent);

    const receipts: WriteReceipt[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    for (const op of ops) {
      try {
        const bp = BrainPath.from(op.path);
        const receipt = await this.write(bp, op.content);
        receipts.push(receipt);
      } catch (err: unknown) {
        failed.push({
          path: op.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Clean up pending.json on success (even partial — we always clean up)
    try {
      await this.delete(pendingPath);
    } catch {
      // best-effort cleanup
    }

    return { receipts, failed };
  }
}
