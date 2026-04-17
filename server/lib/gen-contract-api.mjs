/**
 * Contract API generator.
 *
 * Reads the `const actions = {...}` object literal in wicked-brain-server.mjs
 * and produces:
 *   - A structured JSON manifest of every action (name, implementation, notes)
 *   - A markdown page with a stable H2 taxonomy and symbol-named anchors
 *
 * Pure functions — no I/O. The CLI glue (scripts/gen-wiki.mjs) reads the
 * source, calls the extractor, and writes the outputs.
 *
 * The extractor is intentionally text-based, not AST-based: the file we
 * target is disciplined (one object literal, one handler per line after the
 * `=>`). If the shape changes, this extractor breaks loudly with a failing
 * test rather than silently producing stale output.
 */

const ACTIONS_BLOCK_RE = /const\s+actions\s*=\s*\{\s*\n([\s\S]*?)\n\};/;
const ACTION_LINE_RE = /^\s*(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_-]*))\s*:\s*(async\s+)?\(([^)]*)\)\s*=>/;
const DB_CALL_RE = /\bdb\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
const LSP_CALL_RE = /\blsp\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;

/**
 * Extract actions from the server source. Returns an array in source order.
 */
export function extractActions(source) {
  const block = source.match(ACTIONS_BLOCK_RE);
  if (!block) {
    throw new Error("Could not find `const actions = {...}` block");
  }
  const body = block[1];
  const lines = body.split("\n");
  const actions = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(ACTION_LINE_RE);
    if (!m) { i++; continue; }
    const name = m[1] ?? m[2];
    const isAsync = Boolean(m[3]);
    const paramsSig = m[4].trim();
    // Collect the handler body (rest of this line + following lines until a
    // line that looks like another action or closes the object).
    const handlerLines = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (ACTION_LINE_RE.test(next)) break;
      handlerLines.push(next);
      i++;
    }
    const handlerText = handlerLines.join("\n");
    const impls = collectImplCalls(handlerText);
    actions.push({
      name,
      async: isAsync,
      params: parseParamUses(paramsSig, handlerText),
      impls,
    });
  }
  return actions;
}

/**
 * Render a contract-api.md page from the extracted actions.
 * Declares canonical_for: [CONTRACT-API] so it's the single source.
 */
export function renderContractApi({ actions, generatedAt, sourcePath }) {
  const lines = [];
  lines.push("---");
  lines.push("status: published");
  lines.push("canonical_for: [CONTRACT-API]");
  lines.push("references: []");
  lines.push(`owner: core`);
  lines.push(`last_reviewed: ${generatedAt}`);
  lines.push("generated: true");
  lines.push(`source: ${sourcePath}`);
  lines.push("---");
  lines.push("");
  lines.push("# Contract: `POST /api`");
  lines.push("");
  lines.push("Single endpoint, action-dispatched. Body shape:");
  lines.push("");
  lines.push("```json");
  lines.push('{ "action": "<name>", "params": { ... } }');
  lines.push("```");
  lines.push("");
  lines.push(
    "This page is **generated** from the server source. Do not hand-edit — "
    + "changes will be overwritten on the next `npm run gen:wiki`. The truth "
    + `lives at \`${sourcePath}\`; update that, then regenerate.`,
  );
  lines.push("");
  lines.push("## Actions");
  lines.push("");
  lines.push("| Action | Params referenced | Implementation |");
  lines.push("|---|---|---|");
  for (const a of actions) {
    const params = a.params.length ? a.params.map((p) => `\`${p}\``).join(", ") : "—";
    const impls = a.impls.length
      ? a.impls.map((i) => `\`${i.target}#${i.method}\``).join(", ")
      : "—";
    lines.push(`| \`${a.name}\` | ${params} | ${impls} |`);
  }
  lines.push("");
  lines.push("## Per-action anchors");
  lines.push("");
  for (const a of actions) {
    lines.push(`### \`${a.name}\``);
    lines.push("");
    if (a.impls.length) {
      for (const impl of a.impls) {
        lines.push(`- Implementation: \`${impl.target}#${impl.method}\``);
      }
    } else {
      lines.push("- Implementation: inline in the action handler (no single delegate).");
    }
    if (a.params.length) {
      lines.push(`- Params referenced: ${a.params.map((p) => `\`${p}\``).join(", ")}`);
    }
    if (a.async) lines.push("- Async handler.");
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

/**
 * Produce the structured manifest used by tests and machine consumers.
 */
export function renderActionsJson({ actions, generatedAt, sourcePath }) {
  return {
    generated_at: generatedAt,
    source: sourcePath,
    canonical_id: "CONTRACT-API",
    count: actions.length,
    actions,
  };
}

// --- internals ---

function collectImplCalls(text) {
  const out = [];
  const seen = new Set();
  DB_CALL_RE.lastIndex = 0;
  let m;
  while ((m = DB_CALL_RE.exec(text)) !== null) {
    const key = `db:${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ target: "server/lib/sqlite-search.mjs", method: m[1] });
  }
  LSP_CALL_RE.lastIndex = 0;
  while ((m = LSP_CALL_RE.exec(text)) !== null) {
    const key = `lsp:${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ target: "server/lib/lsp-client.mjs", method: m[1] });
  }
  return out;
}

function parseParamUses(paramsSig, handlerText) {
  if (paramsSig.length === 0) return [];
  // paramsSig is typically `p` — find `p.xxx` references in the body.
  const name = paramsSig.replace(/[={}:[\]].*$/, "").trim().split(/\s|,/)[0];
  if (!name || /[^a-zA-Z_]/.test(name)) return [];
  const re = new RegExp(`\\b${name}\\.([a-zA-Z_][a-zA-Z0-9_]*)`, "g");
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(handlerText)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(m[1]);
  }
  return out;
}
