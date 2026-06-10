/**
 * codegraph-extractors/dispatch.mjs — command→agent injected edges.
 *
 * A slash command dispatches to a subagent via a `subagent_type: <plugin>:<domain>:<name>`
 * string (in Task(subagent_type="...") or YAML frontmatter). The command file never
 * references the agent file — grep/static can't link them. This extractor injects
 * those edges so blast-radius traversal can surface the dispatching commands when
 * an agent changes.
 *
 * Edge direction: source=command (dependent) → target=agent (dependency).
 * DEPENDENTS_BY="target": blastRadius(agent) = WHERE target=agent → source=command ✓
 *
 * Port of wicked-garden's inject_dispatch_edges.py. Direction is already correct
 * in the garden version for our blast-radius convention (no reversal needed, unlike bus).
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ensureFileNode } from "../codegraph-nodes.mjs";

const INJECTED_PROVENANCE = "injected:dispatch";

// Matches subagent_type: "plugin:domain:name" or subagent_type="plugin:domain:name"
// (with or without quotes, colon or equals separator)
const SUBAGENT_RE = /subagent_type\s*[:=]\s*["']?([a-z0-9_-]+:[a-z0-9_-]+:[a-z0-9_-]+)["']?/g;

/**
 * Recursively collect all .md files under dir.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectMdFiles(dir) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      results.push(...collectMdFiles(full));
    } else if (entry.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Given a handle `plugin:domain:name`, resolve to the agent relpath
 * `agents/<domain>/<name>.md`. Returns the relpath if the file exists, else null.
 * @param {string} sourcePath
 * @param {string} handle  e.g. "wicked-garden:d:my-agent"
 * @returns {string|null}
 */
function resolveHandle(sourcePath, handle) {
  const parts = handle.split(":");
  if (parts.length !== 3) return null;
  const [, domain, name] = parts;
  const relpath = `agents/${domain}/${name}.md`;
  if (existsSync(join(sourcePath, relpath))) return relpath;
  return null;
}

/**
 * Extract command→agent dispatch injected edges into the codegraph DB.
 *
 * @param {{ db: import("better-sqlite3").Database, sourcePath: string }} opts
 * @returns {{ edges_added: number, dispatches: number }}
 */
export function extract({ db, sourcePath }) {
  // 1. Idempotent: clear prior dispatch edges
  db.prepare("DELETE FROM edges WHERE provenance = ?").run(INJECTED_PROVENANCE);

  const insertEdge = db.prepare(
    "INSERT INTO edges (source, target, kind, metadata, provenance) VALUES (?, ?, ?, ?, ?)"
  );

  let edges_added = 0;
  let dispatches = 0;

  // 2. Scan commands/**/*.md
  const commandsDir = join(sourcePath, "commands");
  const commandFiles = collectMdFiles(commandsDir);

  for (const absPath of commandFiles) {
    let text;
    try { text = readFileSync(absPath, "utf8"); } catch { continue; }

    // Posix relpath relative to sourcePath
    const relpath = relative(sourcePath, absPath).split(sep).join("/");

    // 3. Find distinct handles in this file
    SUBAGENT_RE.lastIndex = 0;
    const handles = new Set();
    let m;
    while ((m = SUBAGENT_RE.exec(text)) !== null) {
      handles.add(m[1]);
    }

    for (const handle of handles) {
      // 4. Resolve handle to agent file
      const agentRelpath = resolveHandle(sourcePath, handle);
      if (!agentRelpath) continue; // not an agent file, or file doesn't exist

      const src = ensureFileNode(db, relpath);
      const tgt = ensureFileNode(db, agentRelpath);

      insertEdge.run(
        src,
        tgt,
        "references",
        JSON.stringify({ injected: "dispatch", subagent_type: handle }),
        INJECTED_PROVENANCE
      );
      edges_added++;
      dispatches++;
    }
  }

  return { edges_added, dispatches };
}
