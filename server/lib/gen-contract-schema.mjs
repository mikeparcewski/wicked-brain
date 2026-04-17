/**
 * Contract schema generator.
 *
 * Reads `sqlite-search.mjs` and extracts:
 *   - Every `CREATE TABLE IF NOT EXISTS <name>(...)` → tables + columns.
 *   - The migration ladder from `#migrate()` — each `if (currentVersion < N)`
 *     block becomes a migration entry with its notes and the columns/tables
 *     it adds.
 *
 * Pure functions — no I/O. CLI glue writes the outputs.
 */

// "IF NOT EXISTS" is optional so we match CREATE TABLEs in migrations too.
const CREATE_TABLE_RE =
  /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\)\s*;/g;

const ALTER_ADD_COLUMN_RE =
  /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+([A-Z]+(?:\s+[A-Z]+)*)/gi;

// Match `if (currentVersion < N) { ... }`. Body is balanced-brace-captured
// heuristically by scanning outward from the match until depth zero.
const MIGRATION_OPEN_RE = /if\s*\(\s*currentVersion\s*<\s*(\d+)\s*\)\s*\{/g;

/**
 * Extract schema + migrations from sqlite-search.mjs source.
 */
export function extractSchema(source) {
  const tables = extractTables(source);
  const migrations = extractMigrations(source);
  return { tables, migrations };
}

/**
 * Render contract-schema.md.
 */
export function renderContractSchema({ tables, migrations, generatedAt, sourcePath }) {
  const lines = [];
  lines.push("---");
  lines.push("status: published");
  lines.push("canonical_for: [CONTRACT-SCHEMA]");
  lines.push("references: [INV-MIGRATION-REQUIRED]");
  lines.push("owner: core");
  lines.push(`last_reviewed: ${generatedAt}`);
  lines.push("generated: true");
  lines.push(`source: ${sourcePath}`);
  lines.push("---");
  lines.push("");
  lines.push("# Contract: SQLite schema");
  lines.push("");
  lines.push(
    "Generated from `" + sourcePath + "`. Do not hand-edit — regenerate with "
    + "`npm run gen:wiki`. Changes to the schema require a numbered migration "
    + "per `INV-MIGRATION-REQUIRED`.",
  );
  lines.push("");
  lines.push("## Tables");
  lines.push("");
  for (const t of tables) {
    lines.push(`### \`${t.name}\``);
    lines.push("");
    lines.push("| Column | Type | Notes |");
    lines.push("|---|---|---|");
    for (const c of t.columns) {
      lines.push(`| \`${c.name}\` | \`${c.type}\` | ${c.notes || ""} |`);
    }
    lines.push("");
  }

  lines.push("## Migration ladder");
  lines.push("");
  lines.push("| Version | Summary | Operations |");
  lines.push("|---|---|---|");
  for (const m of migrations) {
    const ops = m.ops.length ? m.ops.map((o) => `\`${o}\``).join(", ") : "—";
    lines.push(`| ${m.version} | ${m.summary || "—"} | ${ops} |`);
  }
  lines.push("");
  lines.push("Current head: **v" + (migrations.at(-1)?.version ?? "?") + "**.");
  lines.push("");
  return lines.join("\n") + "\n";
}

export function renderSchemaJson({ tables, migrations, generatedAt, sourcePath }) {
  return {
    generated_at: generatedAt,
    source: sourcePath,
    canonical_id: "CONTRACT-SCHEMA",
    head_version: migrations.at(-1)?.version ?? null,
    tables,
    migrations,
  };
}

// --- internals ---

function extractTables(source) {
  const tables = new Map();
  CREATE_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_TABLE_RE.exec(source)) !== null) {
    const name = m[1];
    // Skip FTS virtual tables from CREATE VIRTUAL TABLE (different grammar);
    // our regex is CREATE TABLE, which won't match those — but also skip
    // `_schema_version` noise duplicates.
    const cols = parseColumns(m[2]);
    if (!cols.length) continue;
    // Prefer first-seen to keep the column list from #initSchema (fuller)
    // rather than a stripped migration copy.
    if (!tables.has(name)) tables.set(name, { name, columns: cols });
  }
  return [...tables.values()];
}

function parseColumns(body) {
  // Split on commas at depth zero so `DEFAULT 0.5` etc. survive.
  const parts = [];
  let depth = 0, buf = "";
  for (const ch of body) {
    if (ch === "(") { depth++; buf += ch; continue; }
    if (ch === ")") { depth--; buf += ch; continue; }
    if (ch === "," && depth === 0) { parts.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim().length > 0) parts.push(buf);

  const out = [];
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // Skip table-level constraints like PRIMARY KEY(a, b).
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(trimmed)) continue;
    const m2 = trimmed.match(/^(\w+)\s+([A-Z]+(?:\s+[A-Z0-9_]+)*)?(.*)$/i);
    if (!m2) continue;
    const name = m2[1];
    const type = (m2[2] || "").trim() || "TEXT";
    const rest = (m2[3] || "").trim();
    out.push({
      name,
      type,
      notes: rest.replace(/\s+/g, " "),
    });
  }
  return out;
}

function extractMigrations(source) {
  const migrations = [];
  MIGRATION_OPEN_RE.lastIndex = 0;
  let m;
  while ((m = MIGRATION_OPEN_RE.exec(source)) !== null) {
    const version = Number(m[1]);
    const blockStart = m.index + m[0].length; // inside `{`
    const blockEnd = findMatchingBrace(source, blockStart - 1);
    if (blockEnd < 0) continue;
    const body = source.slice(blockStart, blockEnd);
    // Find the preceding comment for the summary.
    const preamble = source.slice(Math.max(0, m.index - 400), m.index);
    const commentMatch = preamble.match(new RegExp(`//\\s*Migration\\s+${version}:\\s*(.+)`));
    const summary = commentMatch ? commentMatch[1].trim() : "";
    migrations.push({
      version,
      summary,
      ops: extractMigrationOps(body),
    });
  }
  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}

function extractMigrationOps(body) {
  const ops = new Set();
  ALTER_ADD_COLUMN_RE.lastIndex = 0;
  let m;
  while ((m = ALTER_ADD_COLUMN_RE.exec(body)) !== null) {
    ops.add(`ADD COLUMN ${m[1]}.${m[2]}`);
  }
  const createRe = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s*\(/gi;
  while ((m = createRe.exec(body)) !== null) {
    ops.add(`CREATE TABLE ${m[1]}`);
  }
  const idxRe = /CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s+ON\s+(\w+)/gi;
  while ((m = idxRe.exec(body)) !== null) {
    ops.add(`CREATE INDEX ${m[1]} ON ${m[2]}`);
  }
  return [...ops];
}

function findMatchingBrace(source, openIdx) {
  // openIdx points at '{'
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
