import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { SqliteSearch } from "../lib/sqlite-search.mjs";
import {
  persistConformanceRules, recallRules, enforceConformanceInvariants,
  deleteRuleSet, SEVERITY_ORDER,
} from "../lib/conformance-store.mjs";
import { conformanceFixture } from "../lib/conformance-fixture.mjs";

// Fresh brain DB migrated to head (Migration 8 lives in SqliteSearch), then a
// second handle for the conformance-store to write through — mirrors the
// domain-store test's freshDb().
function freshDb() {
  const path = join(tmpdir(), `brain-conf-${randomUUID()}.db`);
  new SqliteSearch(path, "test-brain"); // runs #migrate() up to v8
  return new Database(path);
}

test("Migration 8: conformance tables exist at head version 8", () => {
  const db = freshDb();
  const v = db.prepare(`SELECT version FROM _schema_version LIMIT 1`).get();
  assert.equal(v.version, 8);
  const names = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);
  for (const t of ["conformance_rule_sets", "conformance_rules", "conformance_rule_provenance"]) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
  db.close();
});

test("persistConformanceRules: normalizes the fixture + stores a symbol_ref as a REFERENCE", () => {
  const db = freshDb();
  const res = persistConformanceRules(db, { project_id: "p", brain_id: "b", document: conformanceFixture() });
  assert.equal(res.rules, 6);

  // The bound rule stored its estate SymbolId — never a copy of the symbol.
  const bound = db.prepare(`SELECT symbol_ref FROM conformance_rules WHERE rule_id = 'PAT-003'`).get();
  assert.equal(bound.symbol_ref, "sym::web::handlers::createOrder");
  // Provenance persisted with source_kinds as JSON.
  const prov = db.prepare(`SELECT p.source_kinds FROM conformance_rule_provenance p
    JOIN conformance_rules r ON r.id = p.rule_id WHERE r.rule_id = 'POL-001'`).get();
  assert.deepEqual(JSON.parse(prov.source_kinds), ["doc"]);
  db.close();
});

test("persistConformanceRules: idempotent per set_id (replace, not stack)", () => {
  const db = freshDb();
  persistConformanceRules(db, { set_id: "fixed", document: conformanceFixture() });
  persistConformanceRules(db, { set_id: "fixed", document: conformanceFixture() });
  const c = db.prepare(`SELECT COUNT(*) c FROM conformance_rules WHERE set_id = 'fixed'`).get();
  assert.equal(c.c, 6); // not doubled
  db.close();
});

test("recall: filters by language facet with wildcard semantics", () => {
  const db = freshDb();
  persistConformanceRules(db, { set_id: "s", document: conformanceFixture() });
  const py = recallRules(db, { set_id: "s", language: "python" }).map((r) => r.id).sort();
  // python-scoped (PAT-002, POL-003) + language-wildcard rules (PAT-001, POL-001, POL-002);
  // PAT-003 is language:typescript -> excluded.
  assert.deepEqual(py, ["PAT-001", "PAT-002", "POL-001", "POL-002", "POL-003"]);
  assert.ok(!py.includes("PAT-003"));
  db.close();
});

test("recall: filters by layer facet with wildcard semantics", () => {
  const db = freshDb();
  persistConformanceRules(db, { set_id: "s", document: conformanceFixture() });
  const repo = recallRules(db, { set_id: "s", layer: "repository" }).map((r) => r.id).sort();
  // layer:repository (PAT-001) + layer-wildcard rules (POL-001, POL-003).
  assert.deepEqual(repo, ["PAT-001", "POL-001", "POL-003"]);
  db.close();
});

test("recall: filters by framework facet with wildcard semantics", () => {
  const db = freshDb();
  persistConformanceRules(db, { set_id: "s", document: conformanceFixture() });
  const exp = recallRules(db, { set_id: "s", framework: "express" }).map((r) => r.id).sort();
  // framework:express (PAT-003, POL-002) + framework-wildcard rules.
  assert.ok(exp.includes("PAT-003") && exp.includes("POL-002"));
  assert.ok(exp.includes("POL-001")); // wildcard framework
  db.close();
});

test("recall: filters by severity (exact match) and by rule_type", () => {
  const db = freshDb();
  persistConformanceRules(db, { set_id: "s", document: conformanceFixture() });
  const crit = recallRules(db, { set_id: "s", severity: "critical" }).map((r) => r.id);
  assert.deepEqual(crit, ["POL-001"]);
  const policies = recallRules(db, { set_id: "s", rule_type: "policy" }).map((r) => r.id).sort();
  assert.deepEqual(policies, ["POL-001", "POL-002", "POL-003"]);
  db.close();
});

test("recall: combined facet slice (the QE-pipeline query shape) returns applicable rules, severity-ranked", () => {
  const db = freshDb();
  persistConformanceRules(db, { set_id: "s", document: conformanceFixture() });
  // "TypeScript express web handler" slice, as a wicked-testing scenario would ask.
  const hits = recallRules(db, { set_id: "s", language: "typescript", layer: "web", framework: "express" });
  const ids = hits.map((r) => r.id);
  assert.ok(ids.includes("PAT-003"), "web/express/typescript pattern applies");
  assert.ok(ids.includes("POL-001"), "the all-wildcard secrets policy applies");
  // Ranked critical-first, then id.
  const sevs = hits.map((r) => SEVERITY_ORDER[r.severity]);
  for (let i = 1; i < sevs.length; i += 1) assert.ok(sevs[i - 1] >= sevs[i], "severity descending");
  // Recall returns fully-reconstructed rules incl. provenance.
  const p1 = hits.find((r) => r.id === "POL-001");
  assert.equal(p1.provenance.source, "acme/security");
  db.close();
});

test("recall: no filters returns the whole set", () => {
  const db = freshDb();
  persistConformanceRules(db, { set_id: "s", document: conformanceFixture() });
  assert.equal(recallRules(db, { set_id: "s" }).length, 6);
  db.close();
});

test("INV-C1: an id whose prefix disagrees with rule_type is rejected", () => {
  assert.throws(() => enforceConformanceInvariants({
    rules: [{ id: "PAT-001", rule_type: "policy", confidence: 0.9 }],
  }), /INV-C1/);
  assert.throws(() => enforceConformanceInvariants({
    rules: [{ id: "POL-001", rule_type: "pattern", confidence: 0.9 }],
  }), /INV-C1/);
});

test("INV-C2: a non-numeric or out-of-range confidence is rejected", () => {
  assert.throws(() => enforceConformanceInvariants({
    rules: [{ id: "PAT-001", rule_type: "pattern", confidence: null }],
  }), /INV-C2/);
  assert.throws(() => enforceConformanceInvariants({
    rules: [{ id: "PAT-001", rule_type: "pattern", confidence: 2 }],
  }), /INV-C2/);
});

test("persistConformanceRules: a schema-invalid document is rejected before any write", () => {
  const db = freshDb();
  const bad = conformanceFixture();
  delete bad.rules[0].confidence; // schema requires it
  assert.throws(() => persistConformanceRules(db, { set_id: "s", document: bad }), /schema validation/);
  const c = db.prepare(`SELECT COUNT(*) c FROM conformance_rules`).get();
  assert.equal(c.c, 0, "nothing persisted on a rejected document");
  db.close();
});

test("deleteRuleSet: removes rules + provenance", () => {
  const db = freshDb();
  persistConformanceRules(db, { set_id: "s", document: conformanceFixture() });
  deleteRuleSet(db, "s");
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM conformance_rules WHERE set_id='s'`).get().c, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM conformance_rule_provenance`).get().c, 0);
  db.close();
});
