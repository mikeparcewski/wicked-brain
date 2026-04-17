#!/usr/bin/env node
/**
 * Regenerate the parts of the wiki that come from code.
 *
 * Reads the server source, extracts action metadata, and writes two
 * artifacts into `docs/wiki/`:
 *   - `contract-api.md` (human-readable, canonical_for: CONTRACT-API)
 *   - `_generated/actions.json` (machine-readable manifest)
 *
 * Run from the repo root:
 *   node server/scripts/gen-wiki.mjs
 *
 * CI should run this in --check mode to fail when the wiki is stale:
 *   node server/scripts/gen-wiki.mjs --check
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractActions,
  renderContractApi,
  renderActionsJson,
} from "../lib/gen-contract-api.mjs";
import {
  extractSchema,
  renderContractSchema,
  renderSchemaJson,
} from "../lib/gen-contract-schema.mjs";
import {
  buildFileRecord,
  renderFileMap,
  renderFileMapJson,
} from "../lib/gen-file-map.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..", "..");

const SERVER_BIN_SOURCE = "server/bin/wicked-brain-server.mjs";
const SQLITE_SOURCE = "server/lib/sqlite-search.mjs";
const FILE_MAP_ROOTS = ["server/lib", "server/bin"];
const WIKI_ROOT = "docs/wiki";
const GENERATED_DIR = path.join(WIKI_ROOT, "_generated");
const CONTRACT_API_MD = path.join(WIKI_ROOT, "contract-api.md");
const CONTRACT_SCHEMA_MD = path.join(WIKI_ROOT, "contract-schema.md");
const MAP_FILES_MD = path.join(WIKI_ROOT, "map-files.md");
const ACTIONS_JSON = path.join(GENERATED_DIR, "actions.json");
const SCHEMA_JSON = path.join(GENERATED_DIR, "schema.json");
const FILES_JSON = path.join(GENERATED_DIR, "files.json");

async function main() {
  const check = process.argv.includes("--check");
  const today = new Date().toISOString().slice(0, 10);
  const artifacts = [];

  // contract-api
  const binSrc = await fs.readFile(path.join(repoRoot, SERVER_BIN_SOURCE), "utf8");
  const actions = extractActions(binSrc);
  artifacts.push({
    relPath: CONTRACT_API_MD,
    content: renderContractApi({ actions, generatedAt: today, sourcePath: SERVER_BIN_SOURCE }),
    description: `${actions.length} actions`,
  });
  artifacts.push({
    relPath: ACTIONS_JSON,
    content: JSON.stringify(
      renderActionsJson({ actions, generatedAt: today, sourcePath: SERVER_BIN_SOURCE }),
      null,
      2,
    ) + "\n",
    description: "actions.json",
  });

  // contract-schema
  const sqliteSrc = await fs.readFile(path.join(repoRoot, SQLITE_SOURCE), "utf8");
  const schema = extractSchema(sqliteSrc);
  artifacts.push({
    relPath: CONTRACT_SCHEMA_MD,
    content: renderContractSchema({ ...schema, generatedAt: today, sourcePath: SQLITE_SOURCE }),
    description: `${schema.tables.length} tables, ${schema.migrations.length} migrations`,
  });
  artifacts.push({
    relPath: SCHEMA_JSON,
    content: JSON.stringify(
      renderSchemaJson({ ...schema, generatedAt: today, sourcePath: SQLITE_SOURCE }),
      null,
      2,
    ) + "\n",
    description: "schema.json",
  });

  // map-files
  const files = await walkSourceRoots(FILE_MAP_ROOTS);
  artifacts.push({
    relPath: MAP_FILES_MD,
    content: renderFileMap({ files, generatedAt: today, sourceRoots: FILE_MAP_ROOTS }),
    description: `${files.length} files`,
  });
  artifacts.push({
    relPath: FILES_JSON,
    content: JSON.stringify(
      renderFileMapJson({ files, generatedAt: today, sourceRoots: FILE_MAP_ROOTS }),
      null,
      2,
    ) + "\n",
    description: "files.json",
  });

  if (check) {
    const stale = [];
    for (const a of artifacts) {
      stale.push(...(await diff(a.relPath, a.content, { ignoreLineRe: STALE_IGNORE })));
    }
    if (stale.length > 0) {
      console.error("Wiki is stale:\n" + stale.join("\n"));
      process.exit(1);
    }
    console.log("Wiki generation is current.");
    return;
  }

  await fs.mkdir(path.join(repoRoot, WIKI_ROOT), { recursive: true });
  await fs.mkdir(path.join(repoRoot, GENERATED_DIR), { recursive: true });
  for (const a of artifacts) {
    await fs.writeFile(path.join(repoRoot, a.relPath), a.content, "utf8");
    console.log(`Wrote ${a.relPath} (${a.description})`);
  }
}

// Line-ignore patterns so day-to-day regeneration does not produce diffs.
const STALE_IGNORE = /^last_reviewed:|"generated_at":/;

async function walkSourceRoots(roots) {
  const out = [];
  for (const root of roots) {
    const abs = path.join(repoRoot, root);
    for (const rel of await listMjs(abs)) {
      const source = await fs.readFile(path.join(abs, rel), "utf8");
      out.push(buildFileRecord({ relPath: path.posix.join(root, rel), source }));
    }
  }
  // Stable alphabetical order keeps the generator deterministic across runs.
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

async function listMjs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".mjs")) out.push(e.name);
  }
  return out;
}

async function diff(relPath, expected, { ignoreLineRe = null } = {}) {
  let actual;
  try {
    actual = await fs.readFile(path.join(repoRoot, relPath), "utf8");
  } catch {
    return [`${relPath}: missing — run \`node server/scripts/gen-wiki.mjs\``];
  }
  const norm = (s) =>
    ignoreLineRe
      ? s.split("\n").filter((l) => !ignoreLineRe.test(l)).join("\n")
      : s;
  if (norm(actual) !== norm(expected)) {
    return [`${relPath}: out of date — run \`node server/scripts/gen-wiki.mjs\``];
  }
  return [];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
