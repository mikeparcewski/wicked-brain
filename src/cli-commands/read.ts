import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { ProgressiveLoader } from "../progressive.js";
import { BrainPath } from "../brain-path.js";

export async function runRead(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  if (positional.length === 0) {
    throw new Error("Usage: brain read <path> [--brain <dir>] [--depth <0|1|2>] [--sections <s1,s2>] [--json]");
  }

  const filePath = positional[0];
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);
  const depth = typeof flags.depth === "string" ? parseInt(flags.depth, 10) : 1;
  const sectionFilter =
    typeof flags.sections === "string"
      ? flags.sections.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    const loader = new ProgressiveLoader(brain);
    const bp = BrainPath.from(filePath);
    const result = await loader.read(bp, depth, sectionFilter);

    if (flags.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stdout.write(`Path: ${result.path}\n`);
      process.stdout.write(`Words: ${result.word_count}  Links: ${result.link_count}${result.truncated ? "  [truncated]" : ""}\n`);
      if (result.summary) {
        process.stdout.write(`\nSummary: ${result.summary}\n`);
      }
      if (result.sections && result.sections.length > 0) {
        process.stdout.write(`\nSections:\n`);
        for (const s of result.sections) {
          process.stdout.write(`  - ${s}\n`);
        }
      }
      if (result.content) {
        process.stdout.write(`\n---\n${result.content}\n---\n`);
      }
      if (result.related.length > 0) {
        process.stdout.write(`\nRelated: ${result.related.join(", ")}\n`);
      }
    }
  } finally {
    brain.close();
  }
}
