import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { EventLog } from "./event-log.js";
import type { LogEntry, LogWriteEntry, LogDeleteEntry, LogTagEntry, LogLinkEntry } from "./types.js";

export class MetaBuilder {
  private metaDir: string;
  private log: EventLog;

  constructor(metaDir: string, log: EventLog) {
    this.metaDir = metaDir;
    this.log = log;
  }

  async rebuild(): Promise<void> {
    const entries = await this.log.readAll();

    await fsp.mkdir(this.metaDir, { recursive: true });

    await Promise.all([
      this.buildManifest(entries),
      this.buildTags(entries),
      this.buildLinks(entries),
      this.buildOrientation(entries),
      this.buildRecent(entries),
    ]);
  }

  private async buildManifest(entries: LogEntry[]): Promise<void> {
    // Build manifest from "write" events with _meta/manifest: prefix
    const manifest: Record<string, unknown> = {};

    for (const entry of entries) {
      if (entry.op === "write") {
        const writeEntry = entry as LogWriteEntry;
        if (writeEntry.path.startsWith("_meta/manifest:")) {
          const key = writeEntry.path.slice("_meta/manifest:".length);
          manifest[key] = {
            hash: writeEntry.content_hash,
            written_at: writeEntry.ts,
            chunks: writeEntry.source_chunks ?? [],
          };
        }
      } else if (entry.op === "delete") {
        const deleteEntry = entry as LogDeleteEntry;
        if (deleteEntry.path.startsWith("_meta/manifest:")) {
          const key = deleteEntry.path.slice("_meta/manifest:".length);
          delete manifest[key];
        }
      }
    }

    await fsp.writeFile(
      path.join(this.metaDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );
  }

  private async buildTags(entries: LogEntry[]): Promise<void> {
    // Build tags.json from "tag" events: maps tag → paths[]
    const tags: Record<string, string[]> = {};

    for (const entry of entries) {
      if (entry.op === "tag") {
        const tagEntry = entry as LogTagEntry;
        for (const tag of tagEntry.tags) {
          if (!tags[tag]) tags[tag] = [];
          if (!tags[tag].includes(tagEntry.path)) {
            tags[tag].push(tagEntry.path);
          }
        }
      }
    }

    await fsp.writeFile(
      path.join(this.metaDir, "tags.json"),
      JSON.stringify(tags, null, 2),
      "utf-8"
    );
  }

  private async buildLinks(entries: LogEntry[]): Promise<void> {
    // Build links.json: { forward: {from→[to]}, backward: {to→[from]} }
    const forward: Record<string, string[]> = {};
    const backward: Record<string, string[]> = {};

    for (const entry of entries) {
      if (entry.op === "link") {
        const linkEntry = entry as LogLinkEntry;
        const { from, to } = linkEntry;

        if (!forward[from]) forward[from] = [];
        if (!forward[from].includes(to)) forward[from].push(to);

        if (!backward[to]) backward[to] = [];
        if (!backward[to].includes(from)) backward[to].push(from);
      }
    }

    await fsp.writeFile(
      path.join(this.metaDir, "links.json"),
      JSON.stringify({ forward, backward }, null, 2),
      "utf-8"
    );
  }

  private async buildOrientation(entries: LogEntry[]): Promise<void> {
    // Count chunks and wiki articles from write events (minus deletes)
    let chunkCount = 0;
    let wikiCount = 0;
    let lastActivity = "";

    const writtenPaths = new Set<string>();
    const deletedPaths = new Set<string>();

    for (const entry of entries) {
      if (entry.ts > lastActivity) lastActivity = entry.ts;

      if (entry.op === "write") {
        const writeEntry = entry as LogWriteEntry;
        // Skip manifest entries
        if (!writeEntry.path.startsWith("_meta/manifest:")) {
          writtenPaths.add(writeEntry.path);
        }
      } else if (entry.op === "delete") {
        const deleteEntry = entry as LogDeleteEntry;
        deletedPaths.add(deleteEntry.path);
      }
    }

    for (const p of writtenPaths) {
      if (!deletedPaths.has(p)) {
        if (p.startsWith("chunks/")) chunkCount++;
        else if (p.startsWith("wiki/")) wikiCount++;
      }
    }

    const lastActivityDisplay = lastActivity
      ? new Date(lastActivity).toISOString()
      : "never";

    const orientation = `# Brain Orientation

## Statistics

- **Chunks**: ${chunkCount}
- **Wiki articles**: ${wikiCount}
- **Last activity**: ${lastActivityDisplay}
`;

    await fsp.writeFile(
      path.join(this.metaDir, "orientation.md"),
      orientation,
      "utf-8"
    );
  }

  private async buildRecent(entries: LogEntry[]): Promise<void> {
    // Events from last 7 days, last 20 entries
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const recent = entries
      .filter((e) => e.ts >= sevenDaysAgo)
      .slice(-20);

    const lines: string[] = ["# Recent Activity\n"];

    for (const entry of recent) {
      const date = new Date(entry.ts).toISOString();
      if (entry.op === "write") {
        const e = entry as LogWriteEntry;
        lines.push(`- **${date}** write \`${e.path}\``);
      } else if (entry.op === "delete") {
        const e = entry as LogDeleteEntry;
        lines.push(`- **${date}** delete \`${e.path}\``);
      } else if (entry.op === "tag") {
        const e = entry as LogTagEntry;
        lines.push(`- **${date}** tag \`${e.path}\` [${e.tags.join(", ")}]`);
      } else if (entry.op === "link") {
        const e = entry as LogLinkEntry;
        lines.push(`- **${date}** link \`${e.from}\` → \`${e.to}\``);
      }
    }

    await fsp.writeFile(
      path.join(this.metaDir, "recent.md"),
      lines.join("\n") + "\n",
      "utf-8"
    );
  }
}
