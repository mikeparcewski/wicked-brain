/**
 * Onboard-wiki orchestrator.
 *
 * Single function that does everything the wiki stack needs at onboard time:
 *   1. Detect repo mode.
 *   2. Write `.wicked-brain/mode.json` (unless override blocks it).
 *   3. Stamp `Contributor wiki: <path>` into CLAUDE.md and/or AGENTS.md if
 *      either exists. Never creates them — that's too opinionated.
 *
 * Returns a structured summary so the CLI can print a human-readable report
 * and skills can branch on mode.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { detectRepoMode } from "./detect-mode.mjs";
import { readModeFile, writeModeFile, diffMode } from "./mode-config.mjs";
import { stampWikiPointer } from "./stamp-pointer.mjs";

const AGENT_CONFIG_FILES = ["CLAUDE.md", "AGENTS.md"];

export async function runOnboardWiki(repoRoot, { force = false } = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const detection = await detectRepoMode(resolvedRoot);

  const existing = await readModeFile(resolvedRoot);
  const diff = diffMode(existing, detection);

  let modeWrite;
  if (existing?.override === true && !force) {
    modeWrite = {
      action: "skipped",
      reason: "override:true — not overwriting without --force",
      mode: existing.mode,
      wiki_root: existing.wiki_root,
    };
  } else {
    const write = await writeModeFile(resolvedRoot, detection, { override: force });
    modeWrite = {
      action: write.written ? (existing ? "updated" : "created") : "skipped",
      reason: write.reason ?? null,
      mode: detection.mode,
      wiki_root: detection.wiki_root,
      diff_fields: diff.fields,
    };
  }

  // Use whatever wiki_root is live on disk after the write step — that's
  // authoritative. Stamping needs the pointer path; we prefix with `./` for
  // clarity in the stamped line.
  const liveMode = await readModeFile(resolvedRoot);
  const wikiRoot = liveMode?.wiki_root ?? detection.wiki_root;
  const pointerPath = wikiRoot.startsWith("./") ? wikiRoot : `./${wikiRoot}`;

  const stamps = [];
  for (const name of AGENT_CONFIG_FILES) {
    const abs = path.join(resolvedRoot, name);
    let raw;
    try {
      raw = await fs.readFile(abs, "utf8");
    } catch {
      stamps.push({ file: name, action: "absent" });
      continue;
    }
    const { content, changed } = stampWikiPointer(raw, pointerPath);
    if (!changed) {
      stamps.push({ file: name, action: "already-current" });
      continue;
    }
    await fs.writeFile(abs, content, "utf8");
    stamps.push({ file: name, action: "stamped" });
  }

  return {
    repo_root: resolvedRoot,
    detection,
    mode_write: modeWrite,
    stamps,
    wiki_root: wikiRoot,
  };
}

/**
 * Text summary of a result, suitable for CLI output.
 */
export function formatOnboardResult(result) {
  const out = [];
  out.push(`repo:       ${result.repo_root}`);
  out.push(`mode:       ${result.detection.mode}`);
  out.push(`wiki_root:  ${result.wiki_root}`);
  out.push(`score:      code=${result.detection.score.code}, content=${result.detection.score.content}`);
  out.push(`mode.json:  ${result.mode_write.action}${result.mode_write.reason ? ` (${result.mode_write.reason})` : ""}`);
  for (const s of result.stamps) {
    out.push(`${s.file.padEnd(10)}: ${s.action}`);
  }
  return out.join("\n");
}
