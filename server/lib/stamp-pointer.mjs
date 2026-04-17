/**
 * CLAUDE.md / AGENTS.md contributor-wiki pointer stamping.
 *
 * Given the current contents of a markdown agent-config file and the wiki
 * root, return a new string with a canonical `## Contributor wiki` section
 * that carries the machine-readable `Contributor wiki: <path>` line.
 *
 * Idempotent: stamping a file that already carries the correct pointer
 * returns the original string unchanged.
 */

const POINTER_LINE_RE = /^\s*Contributor wiki:\s*(\S+)\s*$/m;
const SECTION_HEADING = "## Contributor wiki";

/**
 * Ensure `content` carries a `## Contributor wiki` section with the given
 * wiki_root. Returns { content, changed }.
 *
 * Behavior:
 *   - No existing section → append it at the top (after any leading H1).
 *   - Existing section with the correct path → no-op.
 *   - Existing section with a different path → replace the pointer line.
 *   - Pointer line present outside a section → rewrite in place.
 */
export function stampWikiPointer(content, wikiRoot) {
  const normalized = normalizeWikiRoot(wikiRoot);
  const existing = content.match(POINTER_LINE_RE);

  // Case 1: Pointer already points at the right place. No-op.
  if (existing && normalizeWikiRoot(existing[1]) === normalized) {
    return { content, changed: false };
  }

  // Case 2: Pointer exists but path is stale. Rewrite just the line.
  if (existing) {
    const updated = content.replace(
      POINTER_LINE_RE,
      `Contributor wiki: ${normalized}`,
    );
    return { content: updated, changed: true };
  }

  // Case 3: No pointer at all. Insert a section — after the first H1, or at
  // the top if there is none.
  const section = buildSection(normalized);
  const updated = insertAfterFirstH1(content, section);
  return { content: updated, changed: true };
}

/**
 * Build a new contributor-wiki section. Kept as a small, stable template.
 */
export function buildSection(wikiRoot) {
  return [
    SECTION_HEADING,
    "",
    `Contributor wiki: ${wikiRoot}`,
    "",
    "Invariants, contracts, and extension recipes live there. This pointer is",
    "the machine-readable anchor agents grep for.",
  ].join("\n");
}

// --- internals ---

function normalizeWikiRoot(p) {
  // Keep a leading `./` — the discovery contract treats it as a valid,
  // repo-relative marker. But collapse `./` + trailing slash trivia.
  let s = (p ?? "").trim();
  if (s.length === 0) return "./wiki";
  s = s.replace(/\/+$/, "");
  // Normalize separators for cross-platform consistency.
  s = s.replace(/\\/g, "/");
  return s;
}

function insertAfterFirstH1(content, section) {
  const trimmed = content.trimEnd();
  const lines = content.split("\n");
  // Find the first `# ...` heading.
  let insertLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^# [^#]/.test(lines[i])) {
      // Skip until we hit a blank line after the heading.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "") j++;
      insertLine = j + 1;
      break;
    }
  }
  // If insertLine is 0, the file has no H1 — prepend.
  const before = lines.slice(0, insertLine).join("\n");
  const after = lines.slice(insertLine).join("\n");
  const needsGap = before.length > 0 && !before.endsWith("\n\n");
  const result =
    (insertLine === 0 ? "" : before) +
    (insertLine === 0 ? "" : (needsGap ? "\n" : "")) +
    section +
    "\n" +
    (after.length > 0 ? "\n" + after : "") +
    (trimmed !== content.trimEnd() ? "\n" : "");
  return result.endsWith("\n") ? result : result + "\n";
}
