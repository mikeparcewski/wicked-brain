import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { resolveBrainRefs } from "../federation.js";
import type { SearchQuery } from "../types.js";

export async function runSearch(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  if (positional.length === 0) {
    throw new Error("Usage: brain search <query...> [--brain <dir>] [--depth <n>] [--limit <n>] [--json]");
  }

  const query = positional.join(" ");
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);
  const depth = typeof flags.depth === "string" ? parseInt(flags.depth, 10) : 1;
  const limit = typeof flags.limit === "string" ? parseInt(flags.limit, 10) : 10;

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    const brainRefs = await resolveBrainRefs(brain);

    const searchQuery: SearchQuery = { query, depth, limit };
    const result = await brain.search.searchFederated(searchQuery, brainRefs);

    if (flags.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      if (result.results.length === 0) {
        process.stdout.write(`No results found for: "${query}"\n`);
      } else {
        process.stdout.write(`Found ${result.total_matches} matches (showing ${result.showing}):\n\n`);
        for (const entry of result.results) {
          process.stdout.write(`  [${entry.brain}] ${entry.path}\n`);
          process.stdout.write(`    score: ${entry.score.toFixed(3)}\n`);
          if (entry.summary) {
            process.stdout.write(`    ${entry.summary}\n`);
          }
          process.stdout.write("\n");
        }
        process.stdout.write(`Searched brains: ${result.searched_brains.join(", ")}\n`);
      }

      if (result.unreachable_brains.length > 0) {
        process.stdout.write(
          `Unreachable brains: ${result.unreachable_brains.join(", ")}\n`
        );
      }
    }
  } finally {
    brain.close();
  }
}
