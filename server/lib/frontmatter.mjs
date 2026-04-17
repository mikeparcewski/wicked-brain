/**
 * Minimal YAML-subset frontmatter parser.
 *
 * Supports the exact shape wicked-brain wiki pages use. Does NOT support
 * nested objects, multi-line string folding, anchors, tags, or other full
 * YAML features. If those are ever needed, switch to the `yaml` npm package
 * rather than expanding this.
 *
 * Supported value forms:
 *   key: value                   → string (quotes stripped)
 *   key: "value with :"          → quoted string
 *   key: true / false            → boolean
 *   key: 42                      → number
 *   key: 2026-04-17              → date (kept as string for portability)
 *   key: [a, b, "c, d"]          → inline array of scalars
 *   key:
 *     - a
 *     - b                        → block array of scalars
 *
 * Lines starting with `#` are treated as comments and ignored. Leading and
 * trailing whitespace on each line is stripped.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Split raw content into { frontmatter, body }.
 * If no frontmatter fence is present, returns { frontmatter: null, body: content }.
 */
export function extractFrontmatter(content) {
  if (typeof content !== "string") return { frontmatter: null, body: "" };
  const m = content.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: null, body: content };
  return { frontmatter: m[1], body: m[2] };
}

/**
 * Parse a frontmatter block into a flat object. Returns {} on null/empty input.
 * Throws on clearly malformed input (unclosed block array, duplicate key).
 */
export function parseFrontmatterBlock(block) {
  if (!block) return {};
  const lines = block.split(/\r?\n/);
  const data = {};
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();
    i++;
    if (line.length === 0) continue;
    if (/^\s*#/.test(line)) continue;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("-")) {
      throw new Error(`unexpected list item at top level: ${rawLine}`);
    }
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) {
      throw new Error(`expected 'key: value' but got: ${rawLine}`);
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      throw new Error(`duplicate key: ${key}`);
    }
    if (rest.length === 0) {
      const { array, consumed } = readBlockArray(lines, i);
      data[key] = array;
      i += consumed;
      continue;
    }
    data[key] = parseScalarOrInlineArray(rest);
  }
  return data;
}

/**
 * Parse content into { data, body }. Convenience wrapper for the common case.
 */
export function parseFrontmatter(content) {
  const { frontmatter, body } = extractFrontmatter(content);
  const data = parseFrontmatterBlock(frontmatter);
  return { data, body };
}

/**
 * Get a field value from parsed data. Returns null if missing.
 * Exists primarily so callers can be explicit about "missing" vs "false/0/''".
 */
export function getField(data, name) {
  if (data == null || !Object.prototype.hasOwnProperty.call(data, name)) return null;
  return data[name];
}

/**
 * Serialize a flat object back to a frontmatter block. Inverse of
 * parseFrontmatterBlock for the supported subset. Arrays are emitted inline
 * when short, block form when any element contains a comma or the total
 * length exceeds 60 chars. Booleans/numbers pass through; strings are quoted
 * only when necessary (contain : # [ ] , or leading/trailing whitespace).
 */
export function serializeFrontmatterBlock(data) {
  if (!data || typeof data !== "object") return "";
  const out = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      const inline = `[${value.map((v) => formatScalar(v)).join(", ")}]`;
      if (value.length === 0) {
        out.push(`${key}: []`);
      } else if (inline.length <= 60 && !value.some((v) => typeof v === "string" && v.includes(","))) {
        out.push(`${key}: ${inline}`);
      } else {
        out.push(`${key}:`);
        for (const v of value) out.push(`  - ${formatScalar(v)}`);
      }
    } else {
      out.push(`${key}: ${formatScalar(value)}`);
    }
  }
  return out.join("\n");
}

// --- internals ---

function readBlockArray(lines, startIdx) {
  const items = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0) {
      i++;
      continue;
    }
    const m = line.match(/^\s+-\s+(.*)$/);
    if (!m) break;
    items.push(parseScalarOrInlineArray(m[1].trim()));
    i++;
  }
  return { array: items, consumed: i - startIdx };
}

function parseScalarOrInlineArray(raw) {
  if (raw.length === 0) return "";
  if (raw.startsWith("[")) {
    if (!raw.endsWith("]")) {
      throw new Error(`unterminated inline array: ${raw}`);
    }
    const inner = raw.slice(1, -1).trim();
    if (inner.length === 0) return [];
    return splitInlineArray(inner).map(parseScalar);
  }
  return parseScalar(raw);
}

function splitInlineArray(inner) {
  const out = [];
  let buf = "";
  let inQuote = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      buf += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      buf += ch;
      continue;
    }
    if (ch === ",") {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim().length > 0) out.push(buf.trim());
  return out;
}

function parseScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
  // Dates kept as strings — downstream often wants the original form.
  return trimmed;
}

function formatScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const s = String(value);
  if (s.length === 0) return '""';
  if (/[:#\[\],]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}
