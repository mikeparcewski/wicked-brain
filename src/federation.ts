import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BrainHandle } from "./brain.js";
import type { BrainRef } from "./types.js";

/**
 * Resolves all brain references (self + parents + links) for a given brain.
 * Returns an array of BrainRef describing each connected brain.
 */
export async function resolveBrainRefs(brain: BrainHandle): Promise<BrainRef[]> {
  const config = brain.config();
  const refs: BrainRef[] = [];

  // Self
  refs.push({
    id: config.id,
    path: brain.root,
    relationship: "self",
    accessible: true,
  });

  // Helper to resolve a relative path entry to a BrainRef
  async function resolveRef(
    relativePath: string,
    relationship: "parent" | "link"
  ): Promise<BrainRef> {
    const absolutePath = path.resolve(brain.root, relativePath);
    const brainJsonPath = path.join(absolutePath, "brain.json");

    try {
      const content = await fs.readFile(brainJsonPath, "utf-8");
      const targetConfig = JSON.parse(content) as { id: string };
      return {
        id: targetConfig.id,
        path: absolutePath,
        relationship,
        accessible: true,
      };
    } catch {
      return {
        id: path.basename(absolutePath),
        path: absolutePath,
        relationship,
        accessible: false,
      };
    }
  }

  // Parents
  for (const parentPath of config.parents) {
    refs.push(await resolveRef(parentPath, "parent"));
  }

  // Links
  for (const linkPath of config.links) {
    refs.push(await resolveRef(linkPath, "link"));
  }

  return refs;
}
