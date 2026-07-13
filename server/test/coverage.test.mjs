import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCoverage, classifyNode } from "../lib/coverage.mjs";
import { makeFakeEstateClient, sampleFixtures } from "../lib/estate-client-fake.mjs";
import { validate } from "../lib/schema-validate.mjs";
import { schemas } from "../../schemas/index.mjs";

test("classifyNode: resolved / risk / unaccounted", () => {
  assert.equal(classifyNode({ rule_confidence: 0.9, requirement: "R", requirement_validated: true }, 0.75), "resolved");
  assert.equal(classifyNode({ rule_confidence: 0.4, requirement: "R", requirement_validated: false }, 0.75), "risk");
  assert.equal(classifyNode({ rule_confidence: 0.9, requirement: "R", requirement_validated: false }, 0.75), "risk");
  assert.equal(classifyNode({}, 0.75), "unaccounted");
});

test("computeCoverage: report validates against coverage.schema.json", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { report } = computeCoverage(estate);
  const errs = validate(report, schemas.coverage);
  assert.deepEqual(errs, [], errs.join("\n"));
});

test("computeCoverage: excludes structural leaves; flags the bare node", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { report, ok, unaccounted } = computeCoverage(estate);
  // behavior-bearing: charge, refund, settle, open (Account is a class, fields excluded)
  assert.equal(report.behavior_bearing, 4);
  assert.equal(report.resolved, 2);      // charge + open (>=0.75 & validated)
  assert.equal(report.risk_flagged, 1);  // refund (below threshold)
  assert.equal(report.unaccounted, 1);   // settle (bare)
  assert.equal(ok, false);
  assert.deepEqual(unaccounted, ["sym::pay::settle"]);
  assert.ok(report.coverage < 1.0);
});

test("computeCoverage: full coverage ⇒ ok true, coverage 1.0", () => {
  const fx = sampleFixtures();
  // Give the bare node a resolving rule + validated requirement.
  const settle = fx.nodes.find((n) => n.symbol_id === "sym::pay::settle");
  settle.rule_confidence = 0.9;
  settle.requirement = "REQ-PAY-003";
  settle.requirement_validated = true;
  const estate = makeFakeEstateClient(fx);
  const { report, ok } = computeCoverage(estate);
  assert.equal(ok, true);
  assert.equal(report.coverage, 1.0);
  assert.equal(report.unaccounted, 0);
});

test("computeCoverage: vacuously 1.0 with no behavior-bearing nodes", () => {
  const estate = makeFakeEstateClient({ nodes: [], clusters: [] });
  const { report, ok } = computeCoverage(estate);
  assert.equal(report.coverage, 1.0);
  assert.equal(ok, true);
});

test("computeCoverage: a dead module (zero active out-edges) is excluded", () => {
  const estate = makeFakeEstateClient({
    nodes: [{ symbol_id: "sym::m", name: "deadMod", kind: "module", file: "a/m.js", out_edges: [] }],
  });
  const { report } = computeCoverage(estate);
  assert.equal(report.behavior_bearing, 0);
});
