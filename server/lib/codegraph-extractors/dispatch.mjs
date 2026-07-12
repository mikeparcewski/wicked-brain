/**
 * codegraph-extractors/dispatch.mjs — dispatch injected edges (command/skill → agent/skill).
 *
 * A dispatcher hands work to another agent. Two layouts express this, and this
 * extractor supports both (backward-compatible):
 *
 *   1. Legacy commands/agents layout: a slash command under `commands/**` dispatches
 *      via a `subagent_type: <plugin>:<domain>:<name>` string, resolved to the agent
 *      file `agents/<domain>/<name>.md`.
 *
 *   2. Consolidated skills layout (wicked-garden's agents→skills / commands→skill-actions
 *      cleanup): every dispatchable unit is a skills/.../SKILL.md file. A skill declares its
 *      own identity in frontmatter (`name:`, `subagent_type:`), and a *dispatching* skill
 *      references another skill in its body via `Task(subagent_type="plugin:domain:name")`
 *      or `Skill(skill="wicked-garden-<domain>-<role>")`. Those cross-skill references
 *      become dispatch edges.
 *
 * The referencing file never links the target file — grep/static can't join them. This
 * extractor injects the edges so blast-radius traversal surfaces the dispatchers when a
 * target agent/skill changes.
 *
 * Edge direction: source=dispatcher (dependent) → target=agent/skill (dependency).
 * DEPENDENTS_BY="target": blastRadius(target) = WHERE target=target → source=dispatcher ✓
 *
 * Port of wicked-garden's inject_dispatch_edges.py, extended for the skills layout.
 * Direction is already correct for our blast-radius convention (no reversal, unlike bus).
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ensureFileNode } from "../codegraph-nodes.mjs";

const INJECTED_PROVENANCE = "injected:dispatch";

// Matches subagent_type: "plugin:domain:name" or subagent_type="plugin:domain:name"
// (with or without quotes, colon or equals separator).
const SUBAGENT_RE = /subagent_type\s*[:=]\s*["']?([a-z0-9_-]+:[a-z0-9_-]+:[a-z0-9_-]+)["']?/g;

// Matches a Skill(...) dispatch call, capturing the first skill identifier argument:
//   Skill(skill="wicked-garden-crew-reviewer", ...)
//   Skill("wicked-garden:jam:council")
//   Skill(wicked-garden:platform:prereq-doctor, ...)
// Template placeholders (Skill(skill="wicked-garden-{domain}-{role}")) capture only the
// literal prefix and simply fail to resolve against the skill index, so they're ignored.
const SKILL_CALL_RE = /Skill\(\s*(?:skill\s*=\s*)?["']?([a-z0-9_:-]+)["']?/g;

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
 * Recursively collect all SKILL.md files under dir.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectSkillFiles(dir) {
  return collectMdFiles(dir).filter((p) => p.split(sep).pop() === "SKILL.md");
}

/** POSIX relpath of abs relative to sourcePath. */
function posixRel(sourcePath, abs) {
  return relative(sourcePath, abs).split(sep).join("/");
}

/**
 * Split a markdown file into YAML frontmatter and body.
 * Returns { frontmatter, body }; frontmatter is "" when no leading --- fence.
 * @param {string} text
 * @returns {{ frontmatter: string, body: string }}
 */
function splitFrontmatter(text) {
  const m = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/);
  if (m) return { frontmatter: m[1], body: text.slice(m[0].length) };
  return { frontmatter: "", body: text };
}

/**
 * Read a single-line scalar field from frontmatter text, stripping quotes.
 * @param {string} frontmatter
 * @param {string} field
 * @returns {string|null}
 */
function frontmatterField(frontmatter, field) {
  const re = new RegExp(`^${field}:[ \\t]*(.+?)[ \\t]*$`, "m");
  const m = frontmatter.match(re);
  if (!m) return null;
  return m[1].replace(/^["']|["']$/g, "").trim() || null;
}

/**
 * Given a handle `plugin:domain:name`, resolve to the legacy agent relpath
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
 * Build a lookup from skill identifiers to their SKILL.md relpath.
 * Indexes each skill by its frontmatter `name:` (dir-name form, e.g.
 * `wicked-garden-crew-reviewer`) and its `subagent_type:` handle (e.g.
 * `wicked-garden:crew:reviewer`) — the two forms a dispatcher may reference by.
 *
 * @param {string} sourcePath
 * @param {string[]} skillFiles  absolute SKILL.md paths
 * @returns {Map<string, string>} identifier → relpath
 */
function buildSkillIndex(sourcePath, skillFiles) {
  const index = new Map();
  for (const absPath of skillFiles) {
    let text;
    try { text = readFileSync(absPath, "utf8"); } catch { continue; }
    const relpath = posixRel(sourcePath, absPath);
    const { frontmatter } = splitFrontmatter(text);
    const name = frontmatterField(frontmatter, "name");
    const handle = frontmatterField(frontmatter, "subagent_type");
    if (name) index.set(name, relpath);
    if (handle) index.set(handle, relpath);
  }
  return index;
}

/**
 * Extract dispatch injected edges into the codegraph DB.
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

  // ── Legacy layout: commands/**/*.md → agents/<domain>/<name>.md ──────────────
  const commandFiles = collectMdFiles(join(sourcePath, "commands"));

  for (const absPath of commandFiles) {
    let text;
    try { text = readFileSync(absPath, "utf8"); } catch { continue; }
    const relpath = posixRel(sourcePath, absPath);

    SUBAGENT_RE.lastIndex = 0;
    const handles = new Set();
    let m;
    while ((m = SUBAGENT_RE.exec(text)) !== null) handles.add(m[1]);

    for (const handle of handles) {
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

  // ── Consolidated layout: skills/**/SKILL.md → skills/**/SKILL.md ─────────────
  const skillFiles = collectSkillFiles(join(sourcePath, "skills"));
  const skillIndex = buildSkillIndex(sourcePath, skillFiles);

  for (const absPath of skillFiles) {
    let text;
    try { text = readFileSync(absPath, "utf8"); } catch { continue; }
    const relpath = posixRel(sourcePath, absPath);
    const { body } = splitFrontmatter(text);

    // Collect referenced identifiers from the body only (frontmatter carries the
    // skill's own identity, not its dispatches).
    const refs = new Set();
    SUBAGENT_RE.lastIndex = 0;
    let m;
    while ((m = SUBAGENT_RE.exec(body)) !== null) refs.add(m[1]);
    SKILL_CALL_RE.lastIndex = 0;
    while ((m = SKILL_CALL_RE.exec(body)) !== null) refs.add(m[1]);

    // Resolve each reference to a target skill, deduped by target relpath so a
    // handle + name pointing at the same skill yields a single edge.
    const targets = new Map(); // targetRelpath → the identifier that resolved it
    for (const ref of refs) {
      const targetRel = skillIndex.get(ref);
      if (!targetRel) continue;      // external plugin, template, or unknown → skip
      if (targetRel === relpath) continue; // self-reference (compat note) → skip
      if (!targets.has(targetRel)) targets.set(targetRel, ref);
    }

    for (const [targetRel, ref] of targets) {
      const src = ensureFileNode(db, relpath);
      const tgt = ensureFileNode(db, targetRel);

      insertEdge.run(
        src,
        tgt,
        "references",
        JSON.stringify({ injected: "dispatch", dispatch: ref }),
        INJECTED_PROVENANCE
      );
      edges_added++;
      dispatches++;
    }
  }

  return { edges_added, dispatches };
}
