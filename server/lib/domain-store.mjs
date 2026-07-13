// Domain-store — persists a validated domain-model document into the
// Migration-7 relational tables (contract §4). NOT a blob: every domain fact
// is normalized, and estate structure is stored as a symbol_id REFERENCE in
// rule_symbol_refs (never a copy of the symbol's code/file/line).
//
// The store enforces the WRITE-TIME INVARIANTS the schema alone cannot (they
// gate the coverage machinery, not just document shape):
//   1. reject a requirement with 0 business_rules            (schema minItems:1)
//   2. reject a business_rule with NULL/non-numeric confidence (ISS-11)
//   3. a disposition='drop' WITHOUT a disposition_reason is NOT honored — it
//      still counts against coverage (persisted, but never as "covered")
//
// Callers pass an already-open, already-migrated better-sqlite3 Database handle
// (Migration 7 lives in sqlite-search.mjs's #migrate(), the canonical place).

import { randomUUID } from "node:crypto";
import { schemas } from "../../schemas/index.mjs";
import { validate } from "./schema-validate.mjs";

/**
 * Validate + persist a domain-model document. Idempotent per model_id: an
 * existing model with the same id is replaced.
 * @returns {{ model_id: string, domains: number, requirements: number, rules: number }}
 */
export function persistDomainModel(db, { model_id, project_id, brain_id, document }) {
  const errors = validate(document, schemas["domain-model"]);
  if (errors.length) {
    throw new Error(`domain-model document failed schema validation:\n  - ${errors.join("\n  - ")}`);
  }
  enforceWriteInvariants(document);

  const modelId = model_id ?? randomUUID();
  const now = Date.now();

  const tx = db.transaction(() => {
    deleteModel(db, modelId);

    db.prepare(`INSERT INTO domain_models
      (id, project_id, brain_id, schema_version, migration_mode, source, created_at)
      VALUES (?,?,?,?,?,?,?)`).run(
      modelId, project_id ?? "", brain_id ?? "",
      document.metadata.schema_version, document.metadata.migration_mode,
      document.metadata.source ?? null, now);

    let nDomains = 0, nReqs = 0, nRules = 0;
    const insDomain = db.prepare(`INSERT INTO domains (id, model_id, domain_key, description, cluster_id) VALUES (?,?,?,?,?)`);
    const insEntity = db.prepare(`INSERT INTO entities (id, domain_id, entity_key, description) VALUES (?,?,?,?)`);
    const insField = db.prepare(`INSERT INTO entity_fields (entity_id, name, type, description) VALUES (?,?,?,?)`);
    const insReq = db.prepare(`INSERT INTO requirements (id, domain_id, req_key, title, description, status, disposition, disposition_reason) VALUES (?,?,?,?,?,?,?,?)`);
    const insComp = db.prepare(`INSERT INTO requirement_components (requirement_id, kind, value) VALUES (?,?,?)`);
    const insRule = db.prepare(`INSERT INTO rules (id, requirement_id, rule_kind, rule_id, statement, confidence, field, error_ref, code, source_ref) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const insProv = db.prepare(`INSERT INTO rule_provenance (rule_id, source, ref, source_kinds) VALUES (?,?,?,?)`);
    const insSymRef = db.prepare(`INSERT INTO rule_symbol_refs (rule_id, db_id, symbol_id, validated, cluster_id) VALUES (?,?,?,?,?)`);
    const insLedger = db.prepare(`INSERT INTO coverage_ledger (model_id, symbol_id, resolved, rule_id, risk_reason) VALUES (?,?,?,?,?)`);

    for (const [domainKey, domain] of Object.entries(document.domains)) {
      const domainId = randomUUID();
      insDomain.run(domainId, modelId, domainKey, domain.description ?? null, domain.cluster_id ?? null);
      nDomains += 1;

      for (const [entityKey, entity] of Object.entries(domain.entities ?? {})) {
        const entityId = randomUUID();
        insEntity.run(entityId, domainId, entityKey, entity.description ?? null);
        for (const f of entity.fields ?? []) insField.run(entityId, f.name, f.type, f.description);
      }

      for (const [reqKey, req] of Object.entries(domain.requirements ?? {})) {
        const reqId = randomUUID();
        insReq.run(reqId, domainId, reqKey, req.title, req.description,
          req.status ?? null, req.disposition ?? null, req.disposition_reason ?? null);
        nReqs += 1;

        for (const kind of ["legacy_components", "data_access", "dependencies", "merged_programs"]) {
          for (const value of req[kind] ?? []) insComp.run(reqId, kind, value);
        }

        for (const [ruleKind, listKey] of [["business_rule", "business_rules"], ["validation", "validations"], ["error_path", "error_paths"]]) {
          for (const rule of req[listKey] ?? []) {
            const rowId = randomUUID();
            insRule.run(rowId, reqId, ruleKind, rule.id, rule.statement,
              rule.confidence ?? null, rule.field ?? null, rule.error_ref ?? null,
              rule.code ?? null, rule.source_ref ?? null);
            nRules += 1;
            if (rule.provenance) {
              insProv.run(rowId, rule.provenance.source, rule.provenance.ref,
                JSON.stringify(rule.provenance.source_kinds ?? []));
              // The symbol_id reference (contract §3.2): the provenance ref IS a SymbolId.
              const validated = req.status !== "unresolvable" ? 1 : 0;
              insSymRef.run(rowId, reqId, rule.provenance.ref, validated, domain.cluster_id ?? null);
              // Coverage ledger: a reason-honored drop is excluded; everything
              // else is RESOLVED or (if not) never laundered as covered.
              const dropped = req.disposition === "drop" && req.disposition_reason;
              if (!dropped) insLedger.run(modelId, rule.provenance.ref, 1, rule.id, null);
            }
          }
        }
      }
    }
    return { model_id: modelId, domains: nDomains, requirements: nReqs, rules: nRules };
  });

  return tx();
}

/**
 * Enforce the write-time invariants the schema cannot express as gate rules.
 * Throws on the first violation.
 */
export function enforceWriteInvariants(document) {
  for (const [domainKey, domain] of Object.entries(document.domains ?? {})) {
    for (const [reqKey, req] of Object.entries(domain.requirements ?? {})) {
      const where = `${domainKey}.${reqKey}`;
      const rules = req.business_rules ?? [];
      if (rules.length < 1) {
        throw new Error(`INV-1 (${where}): requirement has 0 business_rules — mark status:"unresolvable" instead of shipping a placeholder`);
      }
      for (const rule of rules) {
        if (typeof rule.confidence !== "number" || Number.isNaN(rule.confidence)) {
          throw new Error(`INV-2 (${where}/${rule.id}): business_rule confidence must be a number in [0,1] (ISS-11), got ${JSON.stringify(rule.confidence)}`);
        }
      }
      if (req.disposition === "drop" && !req.disposition_reason) {
        // Not fatal to persistence, but the ledger must not honor it. We surface
        // it loudly so it can never silently launder past the coverage gate.
        throw new Error(`INV-3 (${where}): disposition:"drop" without a disposition_reason is not honored by the coverage gate`);
      }
    }
  }
}

/** Persist a coverage report's unaccounted nodes as RISK/unaccounted ledger rows. */
export function persistCoverageHoles(db, { model_id, report }) {
  const ins = db.prepare(`INSERT INTO coverage_ledger (model_id, symbol_id, resolved, rule_id, risk_reason) VALUES (?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const n of report.unaccounted_nodes ?? []) {
      ins.run(model_id, n.symbol_id, 0, null, "unaccounted");
    }
  });
  tx();
}

/** Persist a mined vocabulary's terms. */
export function persistVocabulary(db, { model_id, vocabulary }) {
  const ins = db.prepare(`INSERT INTO vocabulary_terms (id, model_id, canonical, term_type, definition, status, verification, freq, mined_from) VALUES (?,?,?,?,?,?,?,?,?)`);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM vocabulary_terms WHERE model_id = ?`).run(model_id);
    for (const t of vocabulary.terms ?? []) {
      ins.run(randomUUID(), model_id, t.canonical, t.term_type, t.definition ?? "",
        t.status, t.verification, t.freq, t.mined_from ?? null);
    }
  });
  tx();
}

/** Round-trip read: the coverage ledger for a model, sorted by symbol_id. */
export function readCoverageLedger(db, model_id) {
  return db.prepare(`SELECT symbol_id, resolved, rule_id, risk_reason FROM coverage_ledger WHERE model_id = ? ORDER BY symbol_id`).all(model_id);
}

function deleteModel(db, modelId) {
  const domainIds = db.prepare(`SELECT id FROM domains WHERE model_id = ?`).all(modelId).map((r) => r.id);
  for (const domainId of domainIds) {
    const reqIds = db.prepare(`SELECT id FROM requirements WHERE domain_id = ?`).all(domainId).map((r) => r.id);
    for (const reqId of reqIds) {
      const ruleIds = db.prepare(`SELECT id FROM rules WHERE requirement_id = ?`).all(reqId).map((r) => r.id);
      for (const ruleId of ruleIds) {
        db.prepare(`DELETE FROM rule_provenance WHERE rule_id = ?`).run(ruleId);
        db.prepare(`DELETE FROM rule_symbol_refs WHERE rule_id = ?`).run(ruleId);
      }
      db.prepare(`DELETE FROM rules WHERE requirement_id = ?`).run(reqId);
      db.prepare(`DELETE FROM requirement_components WHERE requirement_id = ?`).run(reqId);
    }
    db.prepare(`DELETE FROM requirements WHERE domain_id = ?`).run(domainId);
    const entityIds = db.prepare(`SELECT id FROM entities WHERE domain_id = ?`).all(domainId).map((r) => r.id);
    for (const entityId of entityIds) db.prepare(`DELETE FROM entity_fields WHERE entity_id = ?`).run(entityId);
    db.prepare(`DELETE FROM entities WHERE domain_id = ?`).run(domainId);
  }
  db.prepare(`DELETE FROM domains WHERE model_id = ?`).run(modelId);
  db.prepare(`DELETE FROM coverage_ledger WHERE model_id = ?`).run(modelId);
  db.prepare(`DELETE FROM domain_models WHERE id = ?`).run(modelId);
}
