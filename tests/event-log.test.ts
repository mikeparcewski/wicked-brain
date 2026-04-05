import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { EventLog } from "../src/event-log.js";
import type { LogEntry } from "../src/types.js";

let tmpDir: string;
let logPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "event-log-test-"));
  logPath = path.join(tmpDir, "logs", "event.jsonl");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

describe("EventLog", () => {
  it("creates parent directory on first append", async () => {
    const log = new EventLog(logPath);
    const entry: LogEntry = {
      ts: "2024-01-01T00:00:00Z",
      op: "write",
      path: "test.md",
      author: "test",
      content_hash: "abc123",
    };
    await log.append(entry);
    const stat = await fs.stat(path.dirname(logPath));
    expect(stat.isDirectory()).toBe(true);
  });

  it("appends a single entry and reads it back", async () => {
    const log = new EventLog(logPath);
    const entry: LogEntry = {
      ts: "2024-01-01T00:00:00Z",
      op: "write",
      path: "note.md",
      author: "alice",
      content_hash: "deadbeef1234",
    };
    await log.append(entry);
    const all = await log.readAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(entry);
  });

  it("appends multiple entries on separate lines", async () => {
    const log = new EventLog(logPath);
    const entries: LogEntry[] = [
      { ts: "2024-01-01T00:00:00Z", op: "write", path: "a.md", author: "alice", content_hash: "hash1" },
      { ts: "2024-01-02T00:00:00Z", op: "delete", path: "b.md", author: "bob" },
      { ts: "2024-01-03T00:00:00Z", op: "tag", path: "c.md", author: "carol", tags: ["x", "y"] },
    ];

    for (const entry of entries) {
      await log.append(entry);
    }

    const fileContent = await fs.readFile(logPath, "utf-8");
    const lines = fileContent.trim().split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      // Each line must be valid JSON
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("readAll returns all entries", async () => {
    const log = new EventLog(logPath);
    const entries: LogEntry[] = [
      { ts: "2024-01-01T00:00:00Z", op: "write", path: "a.md", author: "alice", content_hash: "h1" },
      { ts: "2024-01-02T00:00:00Z", op: "delete", path: "b.md", author: "bob" },
    ];
    for (const entry of entries) {
      await log.append(entry);
    }
    const all = await log.readAll();
    expect(all).toHaveLength(2);
    expect(all[0].op).toBe("write");
    expect(all[1].op).toBe("delete");
  });

  it("readSince filters correctly by timestamp", async () => {
    const log = new EventLog(logPath);
    const entries: LogEntry[] = [
      { ts: "2024-01-01T00:00:00Z", op: "write", path: "a.md", author: "alice", content_hash: "h1" },
      { ts: "2024-01-02T00:00:00Z", op: "write", path: "b.md", author: "bob", content_hash: "h2" },
      { ts: "2024-01-03T00:00:00Z", op: "write", path: "c.md", author: "carol", content_hash: "h3" },
    ];
    for (const entry of entries) {
      await log.append(entry);
    }

    const since = await log.readSince("2024-01-01T12:00:00Z");
    expect(since).toHaveLength(2);
    expect(since[0].path).toBe("b.md");
    expect(since[1].path).toBe("c.md");
  });

  it("returns empty array for nonexistent log file", async () => {
    const log = new EventLog(logPath);
    const all = await log.readAll();
    expect(all).toEqual([]);
  });

  it("exposes the path property", () => {
    const log = new EventLog(logPath);
    expect(log.path).toBe(logPath);
  });
});
