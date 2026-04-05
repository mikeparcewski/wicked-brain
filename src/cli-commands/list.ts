import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { BrainPath } from "../brain-path.js";

export async function runList(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const listDir = positional[0] ?? ".";
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);
  const recursive = flags.recursive === true || flags.r === true;

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    const bp = listDir === "." ? BrainPath.from(".") : BrainPath.from(listDir);
    const files = await brain.storage.list(bp, {
      pattern: typeof flags.pattern === "string" ? flags.pattern : undefined,
      recursive,
    });

    if (flags.json) {
      process.stdout.write(JSON.stringify(files.map((f) => f.toString()), null, 2) + "\n");
    } else {
      if (files.length === 0) {
        process.stdout.write("No files found.\n");
      } else {
        for (const f of files) {
          process.stdout.write(f.toString() + "\n");
        }
      }
    }
  } finally {
    brain.close();
  }
}
