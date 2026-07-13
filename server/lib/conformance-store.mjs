// Conformance-store — persists a validated conformance-rules document into the
// Migration-8 relational tables, and exposes the RECALL API downstream consumers
// query. Prescriptive sibling of domain-store: NOT a blob — every rule is
// normalized, and an estate binding is stored as a symbol_ref REFERENCE (never a
// copy of the symbol's code/name/file/line).
//
// CONSUMER SURFACES (recallRules is a SUPPORTED, UN-GATED API):
//   - wicked-testing (the QE / acceptance pipeline): a QE scenario pulls the
//     rules that apply to a (language, layer, framework, severity) slice and
//     asserts agent output against them. This is a first-class supported
//     surface — it is NOT gated to garden/crew.
//   - garden (STEERS) / crew (GOVERNS): the two enforcement issues consume the
//     same recall API. deny-dominates / evaluator≠creator live downstream; the
//     store only serves rules.
//
// WRITE-TIME INVARIANTS the schema alone cannot express (mirrors domain-store's
// INV-1/2/3):
//   INV-C1  a rule's id prefix MUST agree with its rule_type (PAT-* => pattern,
//           POL-* => policy). The bundle's hand-rolled validator supports one
//           if/then per object but no else/allOf, so this bidirectional coupling
//           is enforced here, not in the schema.
//   INV-C2  confidence MUST be a number in [0,1] (schema requires number; this
//           re-asserts finiteness + range, never fabricating a value).
//
// Callers pass an already-open, already-migrated better-sqlite3 Database handle
// (Migration 8 lives in sqlite-search.mjs's #migrate(), the canonical place).

import { randomUUID } from "node:crypto";
import { schemas } from "../../schemas/index.mjs";
import { validate } from "./schema-validate.mjs";

/** Severity ordering — exported so a downstream enforcer can map severity to a
 *  gate policy. The store does NOT gate on it (severity is advisory metadata). */
export const SEVERITY_ORDER = Object.freeze({ info: 0, warn: 1, error: 2, critical: 3 });

/**
 * Validate + persist a conformance-rules document. Idempotent per set_id: an
 * existing set with the same id is replaced (not stacked).
 * @returns {{ set_id: string, rules: number }}
 */
export function persistConformanceRules(db, { set_id, project_id, brain_id, document }) {
  const errors = validate(document, schemas["conformance-rules"]);
  if (errors.length) {
    throw new Error(`conformance-rules document failed schema validation:\n  - ${errors.join("\n  - ")}`);
  }
  enforceConformanceInvariants(document);

  const setId = set_id ?? randomUUID();
  const now = Date.now();

  const tx = db.transaction(() => {
    deleteRuleSet(db, setId);

    db.prepare(`INSERT INTO conformance_rule_sets
      (id, project_id, brain_id, schema_version, source, created_at)
      VALUES (?,?,?,?,?,?)`).run(
      setId, project_id ?? "", brain_id ?? "",
      document.metadata.schema_version, document.metadata.source ?? null, now);

    const insRule = db.prepare(`INSERT INTO conformance_rules
      (id, set_id, rule_id, rule_type, statement, severity, language, layer, framework, symbol_ref, confidence, compliance_framework, compliance_control_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insProv = db.prepare(`INSERT INTO conformance_rule_provenance
      (rule_id, source, ref, source_kinds) VALUES (?,?,?,?)`);

    let n = 0;
    for (const rule of document.rules ?? []) {
      const rowId = randomUUID();
      const t = rule.targets ?? {};
      insRule.run(rowId, setId, rule.id, rule.rule_type, rule.statement, rule.severity,
        t.language ?? null, t.layer ?? null, t.framework ?? null,
        rule.symbol_ref ?? null, rule.confidence,
        rule.compliance?.framework ?? null, rule.compliance?.control_id ?? null);
      insProv.run(rowId, rule.provenance.source, rule.provenance.ref,
        JSON.stringify(rule.provenance.source_kinds ?? []));
      n += 1;
    }
    return { set_id: setId, rules: n };
  });

  return tx();
}

/**
 * Enforce the write-time invariants the schema cannot express. Throws on the
 * first violation.
 */
export function enforceConformanceInvariants(document) {
  for (const rule of document.rules ?? []) {
    const where = rule.id ?? "<no-id>";
    const expectedPrefix = rule.rule_type === "policy" ? "POL-" : rule.rule_type === "pattern" ? "PAT-" : null;
    if (expectedPrefix && typeof rule.id === "string" && !rule.id.startsWith(expectedPrefix)) {
      throw new Error(`INV-C1 (${where}): rule_type "${rule.rule_type}" requires an id with prefix "${expectedPrefix}" (PAT-* <=> pattern, POL-* <=> policy)`);
    }
    if (typeof rule.confidence !== "number" || Number.isNaN(rule.confidence) || rule.confidence < 0 || rule.confidence > 1) {
      throw new Error(`INV-C2 (${where}): confidence must be a number in [0,1], got ${JSON.stringify(rule.confidence)}`);
    }
  }
}

/**
 * RECALL API — return the conformance rules that apply to a query slice.
 *
 * Facet semantics: for each of language / layer / framework, a rule matches when
 * its facet is NULL (an ABSENT facet is a WILDCARD — the rule applies broadly)
 * OR equals the queried value. `severity` and `rule_type` are exact matches
 * (a rule always carries both). All filters are optional; omitting a filter
 * matches every value of that facet. Results are ordered by severity
 * (critical-first) then rule id for deterministic, enforcement-friendly output.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {object} [q]  { set_id?, language?, layer?, framework?, severity?, rule_type? }
 * @returns {object[]}  reconstructed Rule objects (schema-shaped, incl. provenance)
 */
export function recallRules(db, q = {}) {
  const where = [];
  const args = [];
  if (q.set_id != null) { where.push(`r.set_id = ?`); args.push(q.set_id); }
  // Wildcard facets: rule.facet IS NULL (applies to all) OR equals the query.
  for (const facet of ["language", "layer", "framework"]) {
    if (q[facet] != null) { where.push(`(r.${facet} IS NULL OR r.${facet} = ?)`); args.push(q[facet]); }
  }
  if (q.severity != null) { where.push(`r.severity = ?`); args.push(q.severity); }
  if (q.rule_type != null) { where.push(`r.rule_type = ?`); args.push(q.rule_type); }

  const sql = `
    SELECT r.id AS row_id, r.rule_id, r.rule_type, r.statement, r.severity,
           r.language, r.layer, r.framework, r.symbol_ref, r.confidence,
           r.compliance_framework, r.compliance_control_id,
           p.source, p.ref, p.source_kinds
    FROM conformance_rules r
    LEFT JOIN conformance_rule_provenance p ON p.rule_id = r.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;

  const rows = db.prepare(sql).all(...args);
  const ranked = rows.map((row) => reconstructRule(row));
  ranked.sort((a, b) =>
    (SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]) || a.id.localeCompare(b.id));
  return ranked;
}

/** Reconstruct a schema-shaped Rule from a joined recall row. */
function reconstructRule(row) {
  const rule = {
    id: row.rule_id,
    rule_type: row.rule_type,
    statement: row.statement,
    severity: row.severity,
    confidence: row.confidence,
  };
  const targets = {};
  if (row.language != null) targets.language = row.language;
  if (row.layer != null) targets.layer = row.layer;
  if (row.framework != null) targets.framework = row.framework;
  if (Object.keys(targets).length) rule.targets = targets;
  if (row.symbol_ref != null) rule.symbol_ref = row.symbol_ref;
  if (row.compliance_framework != null) {
    rule.compliance = { framework: row.compliance_framework, control_id: row.compliance_control_id };
  }
  if (row.source != null) {
    rule.provenance = {
      source: row.source,
      ref: row.ref,
      source_kinds: row.source_kinds ? JSON.parse(row.source_kinds) : [],
    };
  }
  return rule;
}

/** Delete a rule set and all its rows (idempotent replace helper). */
export function deleteRuleSet(db, setId) {
  const ruleRowIds = db.prepare(`SELECT id FROM conformance_rules WHERE set_id = ?`).all(setId).map((r) => r.id);
  for (const rowId of ruleRowIds) {
    db.prepare(`DELETE FROM conformance_rule_provenance WHERE rule_id = ?`).run(rowId);
  }
  db.prepare(`DELETE FROM conformance_rules WHERE set_id = ?`).run(setId);
  db.prepare(`DELETE FROM conformance_rule_sets WHERE id = ?`).run(setId);
}
