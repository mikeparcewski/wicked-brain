import * as path from "node:path";
import { BrainHandle } from "../brain.js";

export async function runDiff(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  void positional;
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);

  // --since accepts ISO timestamp or relative like "1h", "1d"
  let since = typeof flags.since === "string" ? flags.since : "";
  if (!since) {
    // Default: last 24 hours
    since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  } else if (/^\d+[hd]$/.test(since)) {
    const unit = since.slice(-1);
    const amount = parseInt(since.slice(0, -1), 10);
    const ms = unit === "h" ? amount * 60 * 60 * 1000 : amount * 24 * 60 * 60 * 1000;
    since = new Date(Date.now() - ms).toISOString();
  }

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    const entries = await brain.eventLog.readSince(since);

    if (flags.json) {
      process.stdout.write(JSON.stringify(entries, null, 2) + "\n");
    } else {
      if (entries.length === 0) {
        process.stdout.write(`No changes since ${since}\n`);
      } else {
        process.stdout.write(`Changes since ${since} (${entries.length} entries):\n\n`);
        for (const entry of entries) {
          const ts = new Date(entry.ts).toISOString();
          if (entry.op === "write") {
            process.stdout.write(`  ${ts} write   ${entry.path}\n`);
          } else if (entry.op === "delete") {
            process.stdout.write(`  ${ts} delete  ${entry.path}\n`);
          } else if (entry.op === "tag") {
            process.stdout.write(`  ${ts} tag     ${entry.path} [${entry.tags.join(", ")}]\n`);
          } else if (entry.op === "link") {
            process.stdout.write(`  ${ts} link    ${entry.from} → ${entry.to}\n`);
          }
        }
      }
    }
  } finally {
    brain.close();
  }
}
