// Source-connector adapters — normalize an external rule DOC into a candidate
// prescriptive conformance rule (pattern|policy) WITH provenance, so the same
// pipeline can pull rules from wherever an org actually keeps them.
//
// THE ADAPTER INTERFACE (the seam every source implements):
//
//   interface ConformanceAdapter {
//     name: string;               // stable connector name -> provenance.source fallback
//     ingest(): CandidateRule[];   // read the source, return normalized candidate rules
//   }
//
// A CandidateRule is a conformance-rules.schema.json Rule object with provenance
// already filled in (source_kinds:['doc'] for a doc source). Candidates are NOT
// validated or invariant-checked here — ingest only TRANSCRIBES; the store
// (conformance-store.persistConformanceRules) validates the schema and enforces
// the cross-field invariants (INV-C1 id/rule_type coupling, INV-C2 numeric
// confidence). That separation mirrors domain-model: the builder projects,
// domain-store enforces. `toDocument(rules, {source})` wraps candidates into a
// schema-shaped { metadata, rules } document ready to persist.
//
// SHIPPED: filesystemAdapter (reads .md / .json rule docs from a dir).
// STUBBED behind the same interface: confluenceAdapter, sharepointAdapter —
// each throws "not implemented" with the exact wiring seam, so the two garden
// enforcement issues can build disjoint against the interface today.
//
// Dependency-free (CLAUDE.md: better-sqlite3 is the only runtime dep). Paths are
// forward-slash-normalized for Windows.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Default ingest-fidelity confidence for a doc-sourced rule that does not
 * declare its own. Conservative on purpose: a doc-only source rests on
 * source_kinds:['doc'] (trust-eligible, not proven per the spine's TRUST RULE),
 * so an un-annotated ingested rule sits at the midpoint until a human ratifies
 * it upward. A doc MAY override via a `confidence:` field.
 */
export const DEFAULT_INGEST_CONFIDENCE = 0.5;

/** Default severity when a doc omits one. `warn` = advisory, not gate-blocking. */
export const DEFAULT_SEVERITY = "warn";

const fwd = (p) => String(p).replace(/\\/g, "/");

/**
 * Normalize a parsed doc's fields into a candidate Rule (schema-shaped, with
 * provenance). Shared by every adapter so the wire shape is identical no matter
 * the source. Fails LOUD on missing rule_type / statement — never fabricates a
 * rule_type (a policy silently downgraded to a pattern would defeat routing).
 *
 * @param {object} fields  { id?, rule_type, statement?, severity?, language?,
 *                           layer?, framework?, symbol_ref?, confidence? }
 * @param {object} ctx      { source, ref, sourceKinds?, ordinal? }
 * @returns {object} candidate Rule
 */
export function normalizeDoc(fields, { source, ref, sourceKinds = ["doc"], ordinal = 1 }) {
  const ruleType = fields.rule_type;
  if (ruleType !== "pattern" && ruleType !== "policy") {
    throw new Error(`conformance-ingest: ${ref} has rule_type ${JSON.stringify(ruleType)} — must be "pattern" or "policy" (never inferred/fabricated)`);
  }
  const statement = (fields.statement ?? "").trim();
  if (!statement) {
    throw new Error(`conformance-ingest: ${ref} has no statement (frontmatter 'statement:' or a doc body is required)`);
  }

  // id: transcribe if provided; otherwise synthesize with the type-appropriate
  // prefix so the candidate is self-consistent (the store still re-checks INV-C1).
  const prefix = ruleType === "policy" ? "POL" : "PAT";
  const id = fields.id ?? `${prefix}-${String(ordinal).padStart(3, "0")}`;

  const confidence = fields.confidence != null ? Number(fields.confidence) : DEFAULT_INGEST_CONFIDENCE;
  const severity = fields.severity ?? DEFAULT_SEVERITY;

  const targets = {};
  // Read facets from a nested `targets{}` (a schema-shaped JSON rule doc) OR from
  // flat top-level fields (md frontmatter) — else a JSON doc's nested targets are
  // silently dropped on ingest.
  const facetSrc = (fields.targets && typeof fields.targets === "object") ? fields.targets : fields;
  for (const facet of ["language", "layer", "framework"]) {
    if (facetSrc[facet] != null && String(facetSrc[facet]).trim() !== "") targets[facet] = String(facetSrc[facet]).trim();
  }

  const rule = {
    id,
    rule_type: ruleType,
    statement,
    severity,
    confidence,
    provenance: { source, ref, source_kinds: sourceKinds.slice() },
  };
  if (Object.keys(targets).length) rule.targets = targets;
  if (fields.symbol_ref != null && String(fields.symbol_ref).trim() !== "") rule.symbol_ref = String(fields.symbol_ref).trim();
  // Preserve a compliance binding on a schema-shaped JSON doc.
  const comp = fields.compliance;
  if (comp && typeof comp === "object" && comp.framework && comp.control_id) {
    rule.compliance = { framework: String(comp.framework), control_id: String(comp.control_id) };
  }
  return rule;
}

/**
 * Filesystem adapter — reads `.md` and `.json` rule docs from a directory.
 *   .json : a Rule object, an array of Rule objects, or { rules:[...] }. Fields
 *           are transcribed as-is (still normalized through normalizeDoc).
 *   .md   : an optional `---` frontmatter block of `key: value` lines carrying
 *           the fields; the body after it (if any) is the statement when the
 *           frontmatter omits one.
 * Provenance: source = opts.source ?? the dir's basename; ref = the file's
 * basename (forward-slashed); source_kinds = ['doc'].
 *
 * @param {object} opts  { dir, source? }
 * @returns {{ name: string, ingest: () => object[] }}
 */
export function filesystemAdapter({ dir, source } = {}) {
  if (!dir) throw new Error("conformance-ingest: filesystemAdapter requires { dir }");
  const src = source ?? fwd(dir).split("/").filter(Boolean).pop() ?? "filesystem";
  return {
    name: "filesystem",
    ingest() {
      const entries = readdirSync(dir)
        .filter((f) => /\.(md|json)$/i.test(f))
        .filter((f) => { try { return statSync(join(dir, f)).isFile(); } catch { return false; } })
        .sort(); // deterministic order -> deterministic synthesized ids
      const rules = [];
      let ordinal = 0;
      for (const file of entries) {
        const ref = fwd(file);
        const raw = readFileSync(join(dir, file), "utf8");
        const parsedList = /\.json$/i.test(file) ? parseJsonDoc(raw) : [parseMarkdownDoc(raw)];
        for (const fields of parsedList) {
          ordinal += 1;
          rules.push(normalizeDoc(fields, { source: src, ref, sourceKinds: ["doc"], ordinal }));
        }
      }
      return rules;
    },
  };
}

/** Confluence adapter — STUB behind the shared interface. */
export function confluenceAdapter(opts = {}) {
  return {
    name: "confluence",
    ingest() {
      throw new Error(
        "conformance-ingest: Confluence adapter not implemented. SEAM: authenticate to the Confluence REST API, page a space via CQL " +
        "(GET /wiki/rest/api/content?spaceKey=...), then for each page call normalizeDoc(parsedFields, " +
        "{ source: spaceKey, ref: 'confluence:' + pageId, sourceKinds: ['doc'] }) and return the candidates. " +
        `(received option keys: ${Object.keys(opts).join(", ") || "none"})`,
      );
    },
  };
}

/** SharePoint adapter — STUB behind the shared interface. */
export function sharepointAdapter(opts = {}) {
  return {
    name: "sharepoint",
    ingest() {
      throw new Error(
        "conformance-ingest: SharePoint adapter not implemented. SEAM: authenticate via Microsoft Graph, enumerate a document library " +
        "(GET /sites/{siteId}/drives/{driveId}/root/children), then for each rule doc call normalizeDoc(parsedFields, " +
        "{ source: siteId, ref: 'sharepoint:' + itemId, sourceKinds: ['doc'] }) and return the candidates. " +
        `(received option keys: ${Object.keys(opts).join(", ") || "none"})`,
      );
    },
  };
}

/**
 * Wrap candidate rules into a conformance-rules.schema.json document ready for
 * conformance-store.persistConformanceRules (which validates + enforces).
 */
export function toDocument(rules, { source } = {}) {
  return {
    metadata: { schema_version: "1.0.0", ...(source ? { source } : {}) },
    rules: rules ?? [],
  };
}

// --- internals ---

function parseJsonDoc(raw) {
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rules)) return data.rules;
  return [data];
}

/**
 * Parse an optional `---`-fenced frontmatter block of `key: value` lines plus a
 * free-text body. No YAML dependency (CLAUDE.md) — a flat key:value scan, which
 * is all a rule doc needs. Values are unquoted; a body after the block becomes
 * the statement when the frontmatter omits `statement:`.
 */
export function parseMarkdownDoc(raw) {
  const text = String(raw).replace(/\r\n/g, "\n");
  const fields = {};
  let body = text;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = line.match(/^([A-Za-z_]\w*)\s*:\s*(.*)$/);
      if (m) fields[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    body = fm[2];
  }
  if (fields.statement == null) {
    const trimmed = body.trim().replace(/^#+\s*/, "").trim();
    if (trimmed) fields.statement = trimmed.split("\n")[0].trim();
  }
  return fields;
}
