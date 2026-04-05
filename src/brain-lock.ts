import * as fs from "node:fs/promises";
import * as path from "node:path";

interface LockData {
  pid: number;
  operation: string;
  acquired_at: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = process exists but we lack permission to signal it → alive
    // ESRCH = no such process → dead
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}

export class BrainLock {
  private readonly lockPath: string;

  constructor(brainRoot: string) {
    this.lockPath = path.join(brainRoot, ".brain.lock");
  }

  async acquire(operation: string): Promise<void> {
    // Check for existing lock
    try {
      const content = await fs.readFile(this.lockPath, "utf-8");
      const data = JSON.parse(content) as LockData;

      if (isProcessAlive(data.pid)) {
        if (data.pid === process.pid) {
          // Same process — allow re-acquire (update operation)
        } else {
          throw new Error(
            `Brain is locked by process ${data.pid} (operation: ${data.operation})`
          );
        }
      }
      // Dead PID — stale lock, reclaim it
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        // No lock file — proceed
      } else if (nodeErr instanceof SyntaxError) {
        // Corrupt lock file — reclaim
      } else if ((err as Error).message?.startsWith("Brain is locked")) {
        throw err;
      }
      // Other errors (e.g., permission) — fall through and try to write
    }

    const lockData: LockData = {
      pid: process.pid,
      operation,
      acquired_at: new Date().toISOString(),
    };

    await fs.mkdir(path.dirname(this.lockPath), { recursive: true });
    await fs.writeFile(this.lockPath, JSON.stringify(lockData), "utf-8");
  }

  async release(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async isLocked(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.lockPath, "utf-8");
      const data = JSON.parse(content) as LockData;
      return isProcessAlive(data.pid);
    } catch {
      return false;
    }
  }
}
