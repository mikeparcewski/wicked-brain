import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BrainConfig } from "../types.js";

/**
 * brain link <target> [--brain <dir>]
 * Adds target to brain.json links[]
 */
export async function runLink(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  if (positional.length === 0) {
    throw new Error("Usage: brain link <target> [--brain <dir>]");
  }

  const target = positional[0];
  await modifyBrainJson(flags, (config) => {
    if (!config.links.includes(target)) {
      config.links.push(target);
    }
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, action: "link", target }) + "\n");
  } else {
    process.stdout.write(`Linked to: ${target}\n`);
  }
}

/**
 * brain parent <target> [--brain <dir>]
 * Adds target to brain.json parents[]
 */
export async function runParent(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  if (positional.length === 0) {
    throw new Error("Usage: brain parent <target> [--brain <dir>]");
  }

  const target = positional[0];
  await modifyBrainJson(flags, (config) => {
    if (!config.parents.includes(target)) {
      config.parents.push(target);
    }
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, action: "parent", target }) + "\n");
  } else {
    process.stdout.write(`Added parent: ${target}\n`);
  }
}

/**
 * brain unlink <target> [--brain <dir>]
 * Removes target from brain.json links[] or parents[]
 */
export async function runUnlink(
  positional: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  if (positional.length === 0) {
    throw new Error("Usage: brain unlink <target> [--brain <dir>]");
  }

  const target = positional[0];
  await modifyBrainJson(flags, (config) => {
    config.links = config.links.filter((l) => l !== target);
    config.parents = config.parents.filter((p) => p !== target);
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, action: "unlink", target }) + "\n");
  } else {
    process.stdout.write(`Unlinked: ${target}\n`);
  }
}

async function modifyBrainJson(
  flags: Record<string, string | boolean>,
  mutate: (config: BrainConfig) => void
): Promise<void> {
  const brainDir = typeof flags.brain === "string" ? flags.brain : ".";
  const resolvedBrain = path.resolve(brainDir);
  const configPath = path.join(resolvedBrain, "brain.json");

  const content = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(content) as BrainConfig;
  mutate(config);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
