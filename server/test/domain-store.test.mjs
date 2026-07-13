import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { SqliteSearch } from "../lib/sqlite-search.mjs";
import {
  persistDomainModel, persistCoverageHoles, persistVocabulary,
  readCoverageLedger, enforceWriteInvariants,
} from "../lib/domain-store.mjs";
import { buildDomainModel } from "../lib/domain-model.mjs";
import { computeCoverage } from "../lib/coverage.mjs";
import { mineVocabulary } from "../lib/vocabulary.mjs";
import { makeFakeEstateClient, sampleFixtures } from "../lib/estate-client-fake.mjs";

// Create a fresh brain DB migrated to head (Migration 7 lives in SqliteSearch),
// then open a second handle for the domain-store to write through.
function freshDb() {
  const path = join(tmpdir(), `brain-domain-${randomUUID()}.db`);
  new SqliteSearch(path, "test-brain"); // runs #migrate() up to v7
  return new Database(path);
}

test("Migration 7: domain-model tables exist at head version 7", () => {
  const db = freshDb();
  const v = db.prepare(`SELECT version FROM _schema_version LIMIT 1`).get();
  assert.equal(v.version, 7);
  const names = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);
  for (const t of ["domain_models", "domains", "requirements", "requirement_components",
    "rules", "rule_provenance", "rule_symbol_refs", "entities", "entity_fields",
    "vocabulary_terms", "term_sources", "coverage_ledger"]) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
  db.close();
});

test("persistDomainModel: normalizes a document + round-trips the coverage ledger", () => {
  const db = freshDb();
  const estate = makeFakeEstateClient(sampleFixtures());
  const { document } = buildDomainModel(estate);
  const res = persistDomainModel(db, { project_id: "p", brain_id: "b", document });
  assert.equal(res.domains, 2);
  assert.equal(res.requirements, 2);
  assert.equal(res.rules, 2);

  // The stored rule references a SymbolId — never a copy of the symbol's source.
  const symRefs = db.prepare(`SELECT symbol_id FROM rule_symbol_refs ORDER BY symbol_id`).all().map((r) => r.symbol_id);
  assert.deepEqual(symRefs, ["sym::acct::open", "sym::pay::charge"]);

  const ledger = readCoverageLedger(db, res.model_id);
  assert.equal(ledger.length, 2);
  assert.ok(ledger.every((r) => r.resolved === 1));
  db.close();
});

test("persistDomainModel: idempotent per model_id (replace, not stack)", () => {
  const db = freshDb();
  const estate = makeFakeEstateClient(sampleFixtures());
  const { document } = buildDomainModel(estate);
  const first = persistDomainModel(db, { model_id: "fixed", document });
  persistDomainModel(db, { model_id: "fixed", document });
  const domains = db.prepare(`SELECT COUNT(*) c FROM domains WHERE model_id = ?`).get("fixed");
  assert.equal(domains.c, first.domains); // not doubled
  db.close();
});

test("INV-1: a requirement with 0 business_rules is rejected", () => {
  assert.throws(() => enforceWriteInvariants({
    domains: { d: { requirements: { R: { business_rules: [] } } } },
  }), /INV-1/);
});

test("INV-2: a business_rule with non-numeric confidence is rejected", () => {
  assert.throws(() => enforceWriteInvariants({
    domains: { d: { requirements: { R: { business_rules: [{ id: "RULE-001", confidence: null }] } } } },
  }), /INV-2/);
});

test("INV-3: disposition drop without a reason is rejected", () => {
  assert.throws(() => enforceWriteInvariants({
    domains: { d: { requirements: { R: {
      business_rules: [{ id: "RULE-001", confidence: 0.9 }],
      disposition: "drop",
    } } } },
  }), /INV-3/);
});

test("persistCoverageHoles + persistVocabulary write the auxiliary stores", () => {
  const db = freshDb();
  const estate = makeFakeEstateClient(sampleFixtures());
  const { report } = computeCoverage(estate);
  const { vocabulary } = mineVocabulary(estate);
  persistCoverageHoles(db, { model_id: "m", report });
  persistVocabulary(db, { model_id: "m", vocabulary });

  const holes = db.prepare(`SELECT symbol_id, resolved FROM coverage_ledger WHERE model_id='m' AND resolved=0`).all();
  assert.deepEqual(holes.map((h) => h.symbol_id), ["sym::pay::settle"]);
  const terms = db.prepare(`SELECT COUNT(*) c FROM vocabulary_terms WHERE model_id='m'`).get();
  assert.equal(terms.c, vocabulary.terms.length);
  db.close();
});

test("persistCoverageHoles is idempotent and preserves resolved rows", () => {
  const db = freshDb();
  const estate = makeFakeEstateClient(sampleFixtures());
  const { report } = computeCoverage(estate);
  // A resolved=1 row a real persistDomainModel would have written.
  db.prepare(`INSERT INTO coverage_ledger (model_id, symbol_id, resolved, rule_id, risk_reason) VALUES ('m','sym::pay::charge',1,'RULE-001',NULL)`).run();
  // Recompute twice: an unanchored insert would double-count the ledger (corrupts GATE_3).
  persistCoverageHoles(db, { model_id: "m", report });
  persistCoverageHoles(db, { model_id: "m", report });
  const holes = db.prepare(`SELECT symbol_id FROM coverage_ledger WHERE model_id='m' AND resolved=0`).all();
  assert.equal(holes.length, report.unaccounted_nodes.length, "recompute must not duplicate unaccounted rows");
  const resolved = db.prepare(`SELECT COUNT(*) c FROM coverage_ledger WHERE model_id='m' AND resolved=1`).get();
  assert.equal(resolved.c, 1, "resolved rows must survive a coverage recompute");
  db.close();
});
