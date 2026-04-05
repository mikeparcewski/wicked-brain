import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { ingestFile } from "../ingest.js";

export async function runIngest(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  if (positional.length === 0) {
    throw new Error("Usage: brain ingest <file> [--brain <dir>]");
  }

  const rawPath = positional[0];
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    await brain.lock.acquire("ingest");
    try {
      const result = await ingestFile(brain, rawPath);
      await brain.lock.release();

      if (flags.json) {
        process.stdout.write(JSON.stringify(result) + "\n");
      } else {
        if (result.skipped) {
          process.stdout.write(`Skipped (already ingested): ${result.source_name}\n`);
        } else {
          const archived = result.archived ? " (previous chunks archived)" : "";
          process.stdout.write(
            `Ingested: ${result.source_name}\n  chunks created: ${result.chunks_created}${archived}\n`
          );
        }
      }
    } catch (err) {
      await brain.lock.release().catch(() => {});
      throw err;
    }
  } finally {
    brain.close();
  }
}
