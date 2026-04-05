import * as path from "node:path";
import { BrainHandle } from "../brain.js";

export async function runStatus(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  void positional;
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);
  const depth = typeof flags.depth === "string" ? parseInt(flags.depth, 10) : 1;

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    const config = brain.config();
    const stats = await brain.search.stats();

    if (flags.json) {
      const output: Record<string, unknown> = { config };
      if (depth >= 1) {
        output.stats = stats;
      }
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    } else {
      process.stdout.write(`Brain: ${config.name} (${config.id})\n`);
      process.stdout.write(`  schema: ${config.schema}\n`);
      process.stdout.write(`  parents: ${config.parents.length > 0 ? config.parents.join(", ") : "(none)"}\n`);
      process.stdout.write(`  links:   ${config.links.length > 0 ? config.links.join(", ") : "(none)"}\n`);

      if (depth >= 1) {
        process.stdout.write(`\nIndex Stats:\n`);
        process.stdout.write(`  total documents: ${stats.total_documents}\n`);
        process.stdout.write(`  chunks:          ${stats.total_chunks}\n`);
        process.stdout.write(`  wiki articles:   ${stats.total_wiki_articles}\n`);
        process.stdout.write(`  index size:      ${(stats.index_size_bytes / 1024).toFixed(1)} KB\n`);
        if (stats.last_indexed) {
          process.stdout.write(`  last indexed:    ${stats.last_indexed}\n`);
        }
      }

      if (depth >= 2 && config.models && Object.keys(config.models).length > 0) {
        process.stdout.write(`\nModels:\n`);
        for (const [key, m] of Object.entries(config.models)) {
          process.stdout.write(`  ${key}: ${m.provider}/${m.model}\n`);
        }
      }
    }
  } finally {
    brain.close();
  }
}
