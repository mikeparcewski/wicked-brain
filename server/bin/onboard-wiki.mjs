#!/usr/bin/env node
/**
 * wicked-brain-onboard-wiki
 *
 * Detect repo mode, write `.wicked-brain/mode.json`, and stamp the
 * `Contributor wiki: <path>` pointer into CLAUDE.md / AGENTS.md.
 *
 * Usage:
 *   wicked-brain-onboard-wiki                      # runs against cwd
 *   wicked-brain-onboard-wiki --repo-root <path>   # runs against <path>
 *   wicked-brain-onboard-wiki --force              # overrides override:true
 */

import process from "node:process";
import { runOnboardWiki, formatOnboardResult } from "../lib/onboard-wiki.mjs";

const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")
    ? args[idx + 1]
    : null;
}

const repoRoot = getFlag("repo-root") ?? process.cwd();
const force = args.includes("--force");

try {
  const result = await runOnboardWiki(repoRoot, { force });
  console.log(formatOnboardResult(result));
  process.exit(0);
} catch (err) {
  console.error(`onboard-wiki failed: ${err.message}`);
  process.exit(1);
}
