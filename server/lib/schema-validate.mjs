// Minimal, dependency-free JSON-Schema (draft-07 subset) validator.
//
// Why hand-rolled: wicked-brain keeps its dependency tree shallow (see
// CLAUDE.md — "every new dependency needs justification"). Pulling ajv in just
// to validate the three domain-model bundle schemas is not warranted. This
// validator implements exactly the keyword subset those schemas use:
//   type, required, properties, additionalProperties (bool), $ref
//   (local #/$defs/* and #/properties/*), items, enum, const, pattern,
//   minItems, minLength, minimum, maximum, if/then.
//
// It is intentionally strict-but-small: unknown keywords are ignored (they are
// not present in our schemas), and it returns a flat list of human-readable
// error strings ([] === valid) so callers can gate on `errors.length === 0`.

/**
 * Validate `data` against `schema`. `root` is the schema document used to
 * resolve local `$ref`s (defaults to `schema`).
 * @returns {string[]} error messages; empty array means valid.
 */
export function validate(data, schema, root = schema, path = "$") {
  const errors = [];
  if (schema == null || typeof schema !== "object") return errors;

  // $ref — resolve local JSON pointer against the root document.
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref, root);
    if (!resolved) {
      errors.push(`${path}: unresolvable $ref ${schema.$ref}`);
      return errors;
    }
    return validate(data, resolved, root, path);
  }

  // type
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(data, t))) {
      errors.push(`${path}: expected type ${types.join("|")}, got ${jsonType(data)}`);
      return errors; // further checks assume the type held
    }
  }

  // const
  if ("const" in schema && !deepEqual(data, schema.const)) {
    errors.push(`${path}: must equal const ${JSON.stringify(schema.const)}`);
  }

  // enum
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => deepEqual(data, e))) {
    errors.push(`${path}: ${JSON.stringify(data)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  // string constraints
  if (typeof data === "string") {
    if (typeof schema.minLength === "number" && data.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(data)) {
      errors.push(`${path}: "${data}" does not match pattern ${schema.pattern}`);
    }
  }

  // number constraints
  if (typeof data === "number") {
    if (typeof schema.minimum === "number" && data < schema.minimum) {
      errors.push(`${path}: ${data} < minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && data > schema.maximum) {
      errors.push(`${path}: ${data} > maximum ${schema.maximum}`);
    }
  }

  // array constraints
  if (Array.isArray(data)) {
    if (typeof schema.minItems === "number" && data.length < schema.minItems) {
      errors.push(`${path}: array shorter than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      data.forEach((item, i) => {
        errors.push(...validate(item, schema.items, root, `${path}[${i}]`));
      });
    }
  }

  // object constraints
  if (isPlainObject(data)) {
    for (const req of schema.required ?? []) {
      if (!(req in data)) errors.push(`${path}: missing required property "${req}"`);
    }
    const props = schema.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in data) errors.push(...validate(data[key], sub, root, `${path}.${key}`));
    }
    // additionalProperties: schema (map value schema) or false (forbid extras)
    if (schema.additionalProperties !== undefined) {
      for (const key of Object.keys(data)) {
        if (key in props) continue;
        if (schema.additionalProperties === false) {
          errors.push(`${path}: additional property "${key}" not allowed`);
        } else if (typeof schema.additionalProperties === "object") {
          errors.push(...validate(data[key], schema.additionalProperties, root, `${path}.${key}`));
        }
      }
    }
    // if / then (used for the disposition=="drop" ⇒ disposition_reason rule)
    if (schema.if && schema.then) {
      const condFails = validate(data, schema.if, root, path).length > 0;
      if (!condFails) {
        errors.push(...validate(data, schema.then, root, path));
      }
    }
  }

  return errors;
}

/** Convenience: throw on the first validation failure. */
export function assertValid(data, schema, root = schema, label = "document") {
  const errors = validate(data, schema, root);
  if (errors.length) {
    throw new Error(`${label} failed schema validation:\n  - ${errors.join("\n  - ")}`);
  }
}

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) return null;
  let node = root;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node == null || typeof node !== "object") return null;
    node = node[key];
  }
  return node ?? null;
}

function matchesType(data, t) {
  switch (t) {
    case "object": return isPlainObject(data);
    case "array": return Array.isArray(data);
    case "string": return typeof data === "string";
    case "number": return typeof data === "number";
    case "integer": return typeof data === "number" && Number.isInteger(data);
    case "boolean": return typeof data === "boolean";
    case "null": return data === null;
    default: return false;
  }
}

function jsonType(data) {
  if (data === null) return "null";
  if (Array.isArray(data)) return "array";
  return typeof data;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
