import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFakeEstateClient, sampleFixtures } from "../lib/estate-client-fake.mjs";

test("fake: read_clusters returns canned communities with members", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const clusters = estate.read_clusters();
  assert.equal(clusters.length, 2);
  assert.ok(clusters[0].members.length >= 1);
});

test("fake: read_clusters honors min_size", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  assert.equal(estate.read_clusters({ min_size: 3 }).length, 1); // only the size-3 payments cluster
});

test("fake: resolve name -> symbol_id(s)", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  assert.deepEqual(estate.resolve("chargeCard"), ["sym::pay::charge"]);
  assert.deepEqual(estate.resolve("nope"), []);
});

test("fake: read_annotations filters by type", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const anns = estate.read_annotations("sym::pay::charge", "business_rule");
  assert.equal(anns.length, 1);
  assert.equal(anns[0].type, "business_rule");
});

test("fake: find_by_annotation reverse lookup", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const hits = estate.find_by_annotation("business_rule");
  assert.ok(hits.includes("sym::pay::charge"));
  assert.ok(hits.includes("sym::acct::open"));
});

test("fake: annotate + set_requirement are RECORDED, not executed", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  estate.annotate({ symbol_id: "sym::pay::charge", type: "domain_action", key: "domain_action", value: "Charge", confidence: 0.9, provenance: "brain:vocab@1.0.0" });
  estate.set_requirement("sym::pay::charge", "REQ-PAY-001", true);
  assert.equal(estate.writes.annotate.length, 1);
  assert.equal(estate.writes.annotate[0].replace, true); // default replace for re-projectable facts
  assert.equal(estate.writes.set_requirement.length, 1);
  assert.deepEqual(estate.writes.set_requirement[0], { symbol_id: "sym::pay::charge", requirement: "REQ-PAY-001", validated: true });
});
