import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BrainLock } from "../src/brain-lock.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "brain-lock-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

describe("BrainLock", () => {
  it("acquires and releases a lock", async () => {
    const lock = new BrainLock(tmpDir);

    await lock.acquire("test-op");
    expect(await lock.isLocked()).toBe(true);

    await lock.release();
    expect(await lock.isLocked()).toBe(false);
  });

  it("lock file contains pid, operation, and acquired_at", async () => {
    const lock = new BrainLock(tmpDir);
    await lock.acquire("my-operation");

    const content = await fs.readFile(path.join(tmpDir, ".brain.lock"), "utf-8");
    const data = JSON.parse(content);
    expect(data.pid).toBe(process.pid);
    expect(data.operation).toBe("my-operation");
    expect(typeof data.acquired_at).toBe("string");

    await lock.release();
  });

  it("fails to acquire when locked by live process (simulated by own pid)", async () => {
    const lock = new BrainLock(tmpDir);

    // Write a lock file with current PID but different instance perspective:
    // We simulate an "other" live process by writing a lock file with the
    // current PID directly, then try to acquire with a second lock instance
    // that won't overwrite because it's the same PID (live).
    // Actually: same PID = allowed re-acquire. So write a fake PID that's live.
    // The most reliable "live" PID is our own. But acquiring from same process allows re-acquire.
    // Instead, write a lock file manually with a different (but live) PID — use 1 (init/launchd)
    // which is always alive on Unix.
    const lockFile = path.join(tmpDir, ".brain.lock");
    await fs.writeFile(
      lockFile,
      JSON.stringify({ pid: 1, operation: "other-op", acquired_at: new Date().toISOString() }),
      "utf-8"
    );

    const lock2 = new BrainLock(tmpDir);
    await expect(lock2.acquire("my-op")).rejects.toThrow("Brain is locked");
  });

  it("reclaims stale lock from dead PID (999999999)", async () => {
    const lockFile = path.join(tmpDir, ".brain.lock");
    const stalePid = 999999999;
    await fs.writeFile(
      lockFile,
      JSON.stringify({ pid: stalePid, operation: "stale-op", acquired_at: "2020-01-01T00:00:00Z" }),
      "utf-8"
    );

    const lock = new BrainLock(tmpDir);
    // Should succeed because the PID is dead
    await expect(lock.acquire("new-op")).resolves.toBeUndefined();

    const content = await fs.readFile(lockFile, "utf-8");
    const data = JSON.parse(content);
    expect(data.pid).toBe(process.pid);
    expect(data.operation).toBe("new-op");

    await lock.release();
  });

  it("isLocked returns false for nonexistent lock file", async () => {
    const lock = new BrainLock(tmpDir);
    expect(await lock.isLocked()).toBe(false);
  });

  it("isLocked returns false for stale lock from dead PID", async () => {
    const lockFile = path.join(tmpDir, ".brain.lock");
    await fs.writeFile(
      lockFile,
      JSON.stringify({ pid: 999999999, operation: "old-op", acquired_at: "2020-01-01T00:00:00Z" }),
      "utf-8"
    );

    const lock = new BrainLock(tmpDir);
    // Dead PID → not locked
    expect(await lock.isLocked()).toBe(false);
  });

  it("release does not throw if lock does not exist", async () => {
    const lock = new BrainLock(tmpDir);
    await expect(lock.release()).resolves.toBeUndefined();
  });
});
