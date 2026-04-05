type Scalar = string | number | boolean | null;
type FrontmatterValue = Scalar | Scalar[] | Record<string, Scalar | Scalar[]>;

function parseScalar(raw: string): Scalar {
  const trimmed = raw.trim();

  // Quoted string
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // null
  if (trimmed === "null" || trimmed === "~") return null;

  // boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed.includes(".") ? parseFloat(trimmed) : parseInt(trimmed, 10);
  }

  return trimmed;
}

function parseInlineArray(raw: string): Scalar[] {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((item) => parseScalar(item.trim()));
}

export function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  // Allow empty frontmatter (---\n---) by not requiring \r?\n before closing ---
  const fmRegex = /^---\r?\n([\s\S]*?)---\r?\n?([\s\S]*)$/;
  const match = markdown.match(fmRegex);

  if (!match) {
    return { frontmatter: {}, body: markdown };
  }

  const yamlBlock = match[1];
  const body = match[2] ?? "";
  const frontmatter: Record<string, FrontmatterValue> = {};

  const lines = yamlBlock.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Top-level key: value
    const topKeyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!topKeyMatch) {
      i++;
      continue;
    }

    const key = topKeyMatch[1];
    const rest = topKeyMatch[2].trim();

    // Inline array
    if (rest.startsWith("[")) {
      frontmatter[key] = parseInlineArray(rest);
      i++;
      continue;
    }

    // Value present on same line
    if (rest !== "") {
      frontmatter[key] = parseScalar(rest);
      i++;
      continue;
    }

    // No value — look ahead for block array or nested object
    i++;
    const arrayItems: Scalar[] = [];
    const nestedObj: Record<string, Scalar | Scalar[]> = {};
    let foundBlock = false;

    while (i < lines.length) {
      const nextLine = lines[i];

      if (nextLine.trim() === "") break;

      // Block array item "  - value"
      const arrayItemMatch = nextLine.match(/^(\s+)-\s+(.+)$/);
      if (arrayItemMatch) {
        arrayItems.push(parseScalar(arrayItemMatch[2]));
        foundBlock = true;
        i++;
        continue;
      }

      // Nested key "  subkey: value"
      const nestedKeyMatch = nextLine.match(/^(\s+)([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
      if (nestedKeyMatch) {
        const subKey = nestedKeyMatch[2];
        const subRest = nestedKeyMatch[3].trim();

        if (subRest.startsWith("[")) {
          nestedObj[subKey] = parseInlineArray(subRest);
        } else if (subRest === "") {
          // Look ahead for sub-array items
          i++;
          const subArray: Scalar[] = [];
          while (i < lines.length) {
            const subLine = lines[i];
            const subArrayMatch = subLine.match(/^(\s{4,}|\t\t)-\s+(.+)$/);
            if (subArrayMatch) {
              subArray.push(parseScalar(subArrayMatch[2]));
              i++;
            } else {
              break;
            }
          }
          nestedObj[subKey] = subArray;
          foundBlock = true;
          continue;
        } else {
          nestedObj[subKey] = parseScalar(subRest);
        }

        foundBlock = true;
        i++;
        continue;
      }

      break;
    }

    if (foundBlock) {
      if (arrayItems.length > 0) {
        frontmatter[key] = arrayItems;
      } else {
        frontmatter[key] = nestedObj;
      }
    } else {
      frontmatter[key] = null;
    }
  }

  return { frontmatter, body };
}

function serializeValue(value: unknown, indent = ""): string {
  if (value === null || value === undefined) return "null";

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return "\n" + value.map((item) => `${indent}- ${serializeScalar(item as Scalar)}`).join("\n");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const lines: string[] = [""];
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) {
        if (v.length === 0) {
          lines.push(`${indent}  ${k}: []`);
        } else {
          lines.push(`${indent}  ${k}:`);
          for (const item of v) {
            lines.push(`${indent}    - ${serializeScalar(item as Scalar)}`);
          }
        }
      } else {
        lines.push(`${indent}  ${k}: ${serializeScalar(v as Scalar)}`);
      }
    }
    return lines.join("\n");
  }

  return serializeScalar(value as Scalar);
}

function serializeScalar(value: Scalar): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  // Quote strings that could be misread as other types
  const s = String(value);
  if (
    s === "true" ||
    s === "false" ||
    s === "null" ||
    s === "~" ||
    /^-?\d+(\.\d+)?$/.test(s) ||
    s.includes(":") ||
    s.startsWith("[") ||
    s.startsWith("{") ||
    s.startsWith('"') ||
    s.startsWith("'")
  ) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const parts: string[] = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        parts.push(`${key}: []`);
      } else {
        parts.push(`${key}:`);
        for (const item of value) {
          parts.push(`  - ${serializeScalar(item as Scalar)}`);
        }
      }
    } else if (value !== null && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      parts.push(`${key}:`);
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v)) {
          if (v.length === 0) {
            parts.push(`  ${k}: []`);
          } else {
            parts.push(`  ${k}:`);
            for (const item of v) {
              parts.push(`    - ${serializeScalar(item as Scalar)}`);
            }
          }
        } else {
          parts.push(`  ${k}: ${serializeScalar(v as Scalar)}`);
        }
      }
    } else {
      parts.push(`${key}: ${serializeScalar(value as Scalar)}`);
    }
  }
  parts.push("---");
  const header = parts.join("\n") + "\n";
  return body ? header + body : header;
}
