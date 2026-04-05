import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BrainHandle } from "./brain.js";
import { parseFrontmatter } from "./frontmatter.js";

/**
 * Extracts a named section (heading + content until next heading of same/higher level)
 * from markdown text. Returns null if section not found.
 */
function extractSection(markdown: string, heading: string): string | null {
  const lines = markdown.split("\n");
  const headingLevel = (heading.match(/^(#+)/) ?? ["", ""])[1].length;

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === heading.trimEnd()) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#+)\s/);
    if (match && match[1].length <= headingLevel) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join("\n");
}

/**
 * Replaces a section in `target` markdown with `replacement` section content.
 * If the heading is not found in target, appends the replacement section.
 */
function replaceSection(target: string, heading: string, replacement: string): string {
  const lines = target.split("\n");
  const headingLevel = (heading.match(/^(#+)/) ?? ["", ""])[1].length;

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === heading.trimEnd()) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    // Section not in target — append
    const trimmed = target.trimEnd();
    return trimmed + (trimmed ? "\n\n" : "") + replacement;
  }

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#+)\s/);
    if (match && match[1].length <= headingLevel) {
      endIdx = i;
      break;
    }
  }

  const replacementLines = replacement.split("\n");
  const result = [
    ...lines.slice(0, startIdx),
    ...replacementLines,
    ...lines.slice(endIdx),
  ];
  return result.join("\n");
}

/**
 * Resolves an _ops/ template for a given operation, walking the parent chain
 * and applying locked_fields from parent templates.
 */
export async function resolveOpsTemplate(
  brain: BrainHandle,
  operation: string
): Promise<string> {
  const filename = `${operation}.md`;

  // Try to read a template from a brain directory
  async function readTemplate(brainRoot: string): Promise<string | null> {
    const templatePath = path.join(brainRoot, "_ops", filename);
    try {
      return await fs.readFile(templatePath, "utf-8");
    } catch {
      return null;
    }
  }

  // Read a brain.json from a path to get parents list
  async function readParents(brainRoot: string): Promise<string[]> {
    const configPath = path.join(brainRoot, "brain.json");
    try {
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content) as { parents?: string[] };
      return config.parents ?? [];
    } catch {
      return [];
    }
  }

  const childTemplate = await readTemplate(brain.root);

  // Walk parent chain to find parent templates
  const config = brain.config();
  let parentTemplate: string | null = null;
  let parentBrainRoot: string | null = null;

  // BFS/DFS through parents — find first accessible parent with the template
  const queue: string[] = config.parents.map((p) => path.resolve(brain.root, p));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentRoot = queue.shift()!;
    if (visited.has(currentRoot)) continue;
    visited.add(currentRoot);

    const tmpl = await readTemplate(currentRoot);
    if (tmpl !== null) {
      parentTemplate = tmpl;
      parentBrainRoot = currentRoot;
      break;
    }

    // Continue walking up the parent chain
    const grandParents = await readParents(currentRoot);
    for (const gp of grandParents) {
      queue.push(path.resolve(currentRoot, gp));
    }
  }

  if (childTemplate === null && parentTemplate === null) {
    return "";
  }

  if (childTemplate === null) {
    return parentTemplate!;
  }

  if (parentTemplate === null) {
    return childTemplate;
  }

  // Both exist — apply locked_fields from parent
  const { frontmatter: parentFm, body: parentBody } = parseFrontmatter(parentTemplate);
  const lockedFields = parentFm["locked_fields"];

  if (!Array.isArray(lockedFields) || lockedFields.length === 0) {
    return childTemplate;
  }

  // Replace each locked section in child with parent's version
  let result = childTemplate;

  // Strip frontmatter from parent body for section extraction
  const parentBodyContent = parentBody;

  for (const heading of lockedFields as string[]) {
    const parentSection = extractSection(parentBodyContent, heading);
    if (parentSection !== null) {
      // Work on the child body (which may or may not have frontmatter)
      const { frontmatter: childFm, body: childBody } = parseFrontmatter(result);
      const hasFrontmatter = Object.keys(childFm).length > 0 || result.startsWith("---");

      if (hasFrontmatter) {
        const updatedBody = replaceSection(childBody, heading, parentSection);
        // Reconstruct with frontmatter
        const fmLines = ["---"];
        for (const [k, v] of Object.entries(childFm)) {
          if (Array.isArray(v)) {
            fmLines.push(`${k}:`);
            for (const item of v) fmLines.push(`  - ${item}`);
          } else {
            fmLines.push(`${k}: ${v}`);
          }
        }
        fmLines.push("---");
        result = fmLines.join("\n") + "\n" + updatedBody;
      } else {
        result = replaceSection(result, heading, parentSection);
      }
    }
  }

  return result;
}
