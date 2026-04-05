import * as path from "node:path";
import * as fs from "node:fs/promises";
import { BrainHandle } from "../brain.js";

export async function runExport(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  void positional;
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);
  const format = typeof flags.format === "string" ? flags.format : "json";

  const brain = await BrainHandle.open(resolvedBrain);
  try {
    const config = brain.config();
    const stats = await brain.search.stats();

    // Try to read meta files if they exist
    const metaDir = path.join(resolvedBrain, "_meta");
    let manifest: unknown = null;
    let tags: unknown = null;
    let links: unknown = null;

    try {
      manifest = JSON.parse(await fs.readFile(path.join(metaDir, "manifest.json"), "utf-8"));
    } catch { /* optional */ }

    try {
      tags = JSON.parse(await fs.readFile(path.join(metaDir, "tags.json"), "utf-8"));
    } catch { /* optional */ }

    try {
      links = JSON.parse(await fs.readFile(path.join(metaDir, "links.json"), "utf-8"));
    } catch { /* optional */ }

    const exportData = {
      config,
      stats,
      manifest,
      tags,
      links,
      exported_at: new Date().toISOString(),
    };

    if (format === "markdown" || flags.md) {
      const lines: string[] = [
        `# Brain Export: ${config.name}`,
        "",
        `- **ID**: ${config.id}`,
        `- **Schema**: ${config.schema}`,
        `- **Exported**: ${exportData.exported_at}`,
        "",
        "## Stats",
        "",
        `- Documents: ${stats.total_documents}`,
        `- Chunks: ${stats.total_chunks}`,
        `- Wiki articles: ${stats.total_wiki_articles}`,
        `- Index size: ${(stats.index_size_bytes / 1024).toFixed(1)} KB`,
        "",
      ];

      if (config.parents.length > 0) {
        lines.push("## Parents", "", ...config.parents.map((p) => `- ${p}`), "");
      }
      if (config.links.length > 0) {
        lines.push("## Links", "", ...config.links.map((l) => `- ${l}`), "");
      }

      process.stdout.write(lines.join("\n") + "\n");
    } else {
      process.stdout.write(JSON.stringify(exportData, null, 2) + "\n");
    }
  } finally {
    brain.close();
  }
}
