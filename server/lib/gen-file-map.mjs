/**
 * File-map generator.
 *
 * Walks `server/lib/` and `server/bin/`, produces a per-file record with:
 *   - Purpose (first paragraph of the earliest JSDoc block, if any)
 *   - Exports (`export function/class/const` plus named re-exports)
 *   - Local imports (relative `./...` imports — other server modules)
 *
 * Output is a markdown page (`map-files.md`) plus a JSON manifest
 * (`_generated/files.json`). Pure functions — CLI glue walks the disk.
 */

const JSDOC_RE = /\/\*\*([\s\S]*?)\*\//;
const EXPORT_NAMED_RE =
  /^\s*export\s+(?:async\s+)?(function|class|const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
const EXPORT_LIST_RE = /^\s*export\s*\{\s*([^}]+)\}\s*(?:from\s*['"][^'"]+['"])?/gm;
const IMPORT_LOCAL_RE =
  /^\s*import\s+[^'"]*?from\s+['"](\.\.?\/[^'"]+)['"]/gm;

/**
 * Build a file-map record from a file's source text.
 */
export function buildFileRecord({ relPath, source }) {
  return {
    path: relPath,
    purpose: extractPurpose(source),
    exports: extractExports(source),
    imports: extractLocalImports(source),
  };
}

/**
 * Render map-files.md from a list of file records (already ordered).
 */
export function renderFileMap({ files, generatedAt, sourceRoots }) {
  const lines = [];
  lines.push("---");
  lines.push("status: published");
  lines.push("canonical_for: [MAP-FILES]");
  lines.push("references: []");
  lines.push("owner: core");
  lines.push(`last_reviewed: ${generatedAt}`);
  lines.push("generated: true");
  lines.push(`source_roots: [${sourceRoots.join(", ")}]`);
  lines.push("---");
  lines.push("");
  lines.push("# Map: files");
  lines.push("");
  lines.push(
    "Generated walk of `" + sourceRoots.join("`, `") + "`. Do not hand-edit — "
    + "regenerate with `npm run gen:wiki`. Purpose strings come from the "
    + "first JSDoc block in each file; files without a JSDoc header have "
    + "empty purpose and are candidates for docstring work.",
  );
  lines.push("");
  lines.push("## Files");
  lines.push("");
  lines.push("| Path | Purpose | Exports | Local imports |");
  lines.push("|---|---|---|---|");
  for (const f of files) {
    const exports = f.exports.length ? f.exports.map((e) => `\`${e}\``).join(", ") : "—";
    const imports = f.imports.length ? f.imports.map((i) => `\`${i}\``).join(", ") : "—";
    const purpose = (f.purpose || "").replace(/\|/g, "\\|");
    lines.push(`| \`${f.path}\` | ${purpose || "—"} | ${exports} | ${imports} |`);
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

export function renderFileMapJson({ files, generatedAt, sourceRoots }) {
  return {
    generated_at: generatedAt,
    source_roots: sourceRoots,
    canonical_id: "MAP-FILES",
    count: files.length,
    files,
  };
}

// --- internals ---

function extractPurpose(source) {
  const m = source.match(JSDOC_RE);
  if (!m) return "";
  // Strip leading `*` prefixes, split into blank-line paragraphs, take first.
  const cleaned = m[1]
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();
  const firstPara = cleaned.split(/\n\s*\n/)[0] || "";
  return firstPara.replace(/\s+/g, " ").trim();
}

function extractExports(source) {
  const out = new Set();
  EXPORT_NAMED_RE.lastIndex = 0;
  let m;
  while ((m = EXPORT_NAMED_RE.exec(source)) !== null) {
    out.add(m[2]);
  }
  EXPORT_LIST_RE.lastIndex = 0;
  while ((m = EXPORT_LIST_RE.exec(source)) !== null) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim().replace(/\s+as\s+.+$/, "").trim())
      .filter(Boolean);
    for (const n of names) out.add(n);
  }
  return [...out].sort();
}

function extractLocalImports(source) {
  const out = new Set();
  IMPORT_LOCAL_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_LOCAL_RE.exec(source)) !== null) {
    out.add(m[1]);
  }
  return [...out].sort();
}
