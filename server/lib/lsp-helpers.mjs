/**
 * LSP helpers — normalization, symbol kind mapping, and chunk building.
 * Split from lsp-client.mjs to keep files under 300 lines.
 */

/**
 * Normalize LSP Location or LocationLink arrays to a simple format.
 */
export function normalizeLocations(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map(loc => {
    const uri = loc.uri || loc.targetUri;
    const range = loc.range || loc.targetSelectionRange || { start: { line: 0, character: 0 } };
    return {
      file: uri ? decodeURIComponent(uri.replace("file://", "")) : null,
      line: range.start.line,
      col: range.start.character,
    };
  }).filter(l => l.file);
}

/**
 * Map LSP SymbolKind number to human-readable string.
 */
const SYMBOL_KINDS = {
  1: "file", 2: "module", 3: "namespace", 4: "package", 5: "class",
  6: "method", 7: "property", 8: "field", 9: "constructor", 10: "enum",
  11: "interface", 12: "function", 13: "variable", 14: "constant",
  15: "string", 16: "number", 17: "boolean", 18: "array", 19: "object",
  20: "key", 21: "null", 22: "enum-member", 23: "struct", 24: "event",
  25: "operator", 26: "type-parameter"
};

export function symbolKindName(kind) {
  return SYMBOL_KINDS[kind] || "unknown";
}

/**
 * Normalize raw documentSymbol results into a flat/nested structure.
 */
export function normalizeSymbols(raw, depth = 0) {
  const symbols = [];
  for (const item of raw) {
    const symbol = {
      name: item.name,
      kind: symbolKindName(item.kind),
      line: item.range?.start?.line ?? item.selectionRange?.start?.line ?? 0,
      endLine: item.range?.end?.line ?? 0,
    };
    if (item.children && item.children.length > 0) {
      symbol.children = normalizeSymbols(item.children, depth + 1);
    }
    symbols.push(symbol);
  }
  return symbols;
}

/**
 * Map LSP DiagnosticSeverity number to string.
 */
export function severityName(severity) {
  return { 1: "error", 2: "warning", 3: "info", 4: "hint" }[severity] || "unknown";
}

/**
 * Build a brain chunk (YAML frontmatter + markdown body) for symbols.
 */
export function buildSymbolChunk(file, language, symbols) {
  const names = symbols.flatMap(s => [s.name, ...(s.children || []).map(c => c.name)]);
  const entities = { functions: [], classes: [], interfaces: [] };
  for (const s of symbols) {
    if (s.kind === "function" || s.kind === "method") entities.functions.push(s.name);
    else if (s.kind === "class") entities.classes.push(s.name);
    else if (s.kind === "interface") entities.interfaces.push(s.name);
  }

  let body = `## Symbols in ${file}\n\n`;
  for (const s of symbols) {
    body += `- ${s.kind} ${s.name} (line ${s.line}${s.endLine > s.line ? `-${s.endLine}` : ""})\n`;
    for (const c of s.children || []) {
      body += `  - ${c.kind} ${c.name} (line ${c.line})\n`;
    }
  }

  const safePath = file.replace(/[/\\]/g, "_").replace(/\./g, "_");
  return `---
source: lsp
source_type: ${language}-language-server
chunk_id: lsp/symbols/${safePath}
content_type:
  - symbols
contains:
  - ${names.join("\n  - ")}
  - ${language}
entities:
  functions: [${entities.functions.map(n => `"${n}"`).join(", ")}]
  classes: [${entities.classes.map(n => `"${n}"`).join(", ")}]
  interfaces: [${entities.interfaces.map(n => `"${n}"`).join(", ")}]
confidence: 0.95
indexed_at: "${new Date().toISOString()}"
---

${body}`;
}

/**
 * Build a brain chunk for diagnostics.
 */
export function buildDiagnosticsChunk(filePath, language, diagnostics) {
  const keywords = [...new Set(diagnostics.map(d => d.message.split(/\s+/).slice(0, 3).join(" ")))];

  let body = `## Diagnostics: ${filePath}\n\n`;
  for (const d of diagnostics) {
    body += `- ${d.severity.charAt(0).toUpperCase() + d.severity.slice(1)} (line ${d.line}, col ${d.col}): ${d.message}\n`;
  }

  const safePath = filePath.replace(/[/\\]/g, "_").replace(/\./g, "_");
  return `---
source: lsp-diagnostics
source_type: ${language}-language-server
chunk_id: lsp/diagnostics/${safePath}
content_type:
  - diagnostics
contains:
  - ${keywords.join("\n  - ")}
  - ${language}
confidence: 0.95
indexed_at: "${new Date().toISOString()}"
---

${body}`;
}
