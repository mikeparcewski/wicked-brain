import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { BrainPath } from "../brain-path.js";
import { parseFrontmatter } from "../frontmatter.js";

export async function runRebuildIndex(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  void positional;
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    await brain.lock.acquire("rebuild-index");
    let indexed = 0;
    const errors: string[] = [];

    // Collect all markdown files from chunks and wiki
    const allFiles: BrainPath[] = [];
    for (const dir of ["chunks", "wiki"]) {
      try {
        const files = await brain.storage.list(BrainPath.from(dir), { recursive: true });
        allFiles.push(...files.filter((f) => f.toString().endsWith(".md")));
      } catch { /* dir may not exist */ }
    }

    for (const filePath of allFiles) {
      try {
        const content = await brain.storage.read(filePath);
        const { frontmatter, body } = parseFrontmatter(content);
        const pathStr = filePath.toString();
        const id = (frontmatter.chunk_id as string | undefined) ?? pathStr;

        await brain.search.index({
          id,
          path: pathStr,
          content: body,
          frontmatter,
          brain_id: brain.config().id,
        });
        indexed++;
      } catch (err) {
        errors.push(`${filePath}: ${(err as Error).message}`);
      }
    }

    await brain.lock.release();

    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, indexed, errors }) + "\n");
    } else {
      process.stdout.write(`Reindexed ${indexed} file(s).\n`);
      if (errors.length > 0) {
        process.stdout.write(`Errors (${errors.length}):\n`);
        for (const e of errors) {
          process.stdout.write(`  ${e}\n`);
        }
      }
    }
  } catch (err) {
    await brain.lock.release().catch(() => {});
    throw err;
  } finally {
    brain.close();
  }
}
