import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { MetaBuilder } from "../meta-builder.js";

export async function runRebuildMeta(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  void positional;
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    const metaDir = path.join(resolvedBrain, "_meta");
    const builder = new MetaBuilder(metaDir, brain.eventLog);
    await builder.rebuild();

    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, meta_dir: metaDir }) + "\n");
    } else {
      process.stdout.write(`Meta rebuilt at: ${metaDir}\n`);
    }
  } finally {
    brain.close();
  }
}
