import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { LogEntry } from "./types.js";

export class EventLog {
  readonly path: string;

  constructor(logPath: string) {
    this.path = logPath;
  }

  async append(entry: LogEntry): Promise<void> {
    const dir = path.dirname(this.path);
    await fs.mkdir(dir, { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    await fs.appendFile(this.path, line, "utf-8");
  }

  async readAll(): Promise<LogEntry[]> {
    let content: string;
    try {
      content = await fs.readFile(this.path, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const entries: LogEntry[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      entries.push(JSON.parse(trimmed) as LogEntry);
    }
    return entries;
  }

  async readSince(since: string): Promise<LogEntry[]> {
    const all = await this.readAll();
    return all.filter((entry) => entry.ts > since);
  }
}
