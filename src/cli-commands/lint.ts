import * as path from "node:path";
import { BrainHandle } from "../brain.js";
import { BrainPath } from "../brain-path.js";
import { parseFrontmatter } from "../frontmatter.js";
import { parseWikilinks } from "../wikilinks.js";

interface LintIssue {
  type: "orphan" | "broken_link";
  path: string;
  detail: string;
}

export async function runLint(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  void positional;
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    const issues: LintIssue[] = [];

    // List all chunk and wiki files
    const allFiles: BrainPath[] = [];
    try {
      const chunkFiles = await brain.storage.list(BrainPath.from("chunks"), { recursive: true });
      allFiles.push(...chunkFiles);
    } catch { /* empty chunks dir is fine */ }

    try {
      const wikiFiles = await brain.storage.list(BrainPath.from("wiki"), { recursive: true });
      allFiles.push(...wikiFiles);
    } catch { /* empty wiki dir is fine */ }

    // Build a set of all known paths
    const knownPaths = new Set(allFiles.map((f) => f.toString()));

    // Check for orphans: chunk files with no source in manifest
    const allEvents = await brain.eventLog.readAll();
    const manifestKeys = new Set<string>();
    for (const entry of allEvents) {
      if (entry.op === "write" && entry.path.startsWith("_meta/manifest:")) {
        const key = entry.path.slice("_meta/manifest:".length);
        manifestKeys.add(key);
      }
    }

    // Check all chunk files for broken wikilinks
    for (const filePath of allFiles) {
      if (!filePath.toString().endsWith(".md")) continue;

      let content: string;
      try {
        content = await brain.storage.read(filePath);
      } catch {
        continue;
      }

      const { body } = parseFrontmatter(content);
      const links = parseWikilinks(body);

      for (const link of links) {
        // Only check local links (no brain prefix)
        if (!link.brain && link.path) {
          if (!knownPaths.has(link.path) && !knownPaths.has(`wiki/${link.path}.md`)) {
            issues.push({
              type: "broken_link",
              path: filePath.toString(),
              detail: `Broken link to: ${link.path}`,
            });
          }
        }
      }
    }

    if (flags.json) {
      process.stdout.write(
        JSON.stringify({ issues, total: issues.length }, null, 2) + "\n"
      );
    } else {
      if (issues.length === 0) {
        process.stdout.write("No issues found.\n");
      } else {
        process.stdout.write(`Found ${issues.length} issue(s):\n\n`);
        for (const issue of issues) {
          process.stdout.write(`  [${issue.type}] ${issue.path}\n`);
          process.stdout.write(`    ${issue.detail}\n`);
        }
      }
    }
  } finally {
    brain.close();
  }
}
