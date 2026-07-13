import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDomainModel } from "../lib/domain-model.mjs";
import { makeFakeEstateClient, sampleFixtures } from "../lib/estate-client-fake.mjs";
import { validate } from "../lib/schema-validate.mjs";
import { schemas } from "../../schemas/index.mjs";

test("buildDomainModel: document validates against domain-model.schema.json", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { document } = buildDomainModel(estate, { source: "acme/monolith" });
  const errs = validate(document, schemas["domain-model"]);
  assert.deepEqual(errs, [], errs.join("\n"));
});

test("buildDomainModel: a confidence-less annotation is dropped (coverage hole), never fabricated as confidence:0", () => {
  const fx = sampleFixtures();
  const badSym = "sym::pay::charge";
  // Malformed evidence: a business_rule annotation with NO numeric confidence.
  fx.annotations[badSym] = [
    { type: "business_rule", key: "business_rule", value: "unmeasured rule", provenance: "brain:extract@1.0.0" },
  ];
  const estate = makeFakeEstateClient(fx);
  const { document } = buildDomainModel(estate);
  const rules = Object.values(document.domains)
    .flatMap((d) => Object.values(d.requirements))
    .flatMap((r) => r.business_rules);
  assert.ok(
    !rules.some((r) => r.provenance.ref === badSym),
    "a confidence-less annotation must be dropped (the node stays a coverage hole), not laundered into a rule",
  );
});

test("buildDomainModel: domains derive from clusters and record cluster_id", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { document } = buildDomainModel(estate);
  const domains = Object.values(document.domains);
  assert.equal(domains.length, 2);
  assert.deepEqual(domains.map((d) => d.cluster_id).sort(), [0, 1]);
});

test("buildDomainModel: requirements reference SymbolIds, never copy code", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { document } = buildDomainModel(estate);
  const payments = document.domains.payments;
  assert.ok(payments, "expected a 'payments' domain slug");
  const req = Object.values(payments.requirements)[0];
  assert.deepEqual(req.legacy_components, ["sym::pay::charge"]);
  assert.equal(req.business_rules[0].provenance.ref, "sym::pay::charge");
  assert.match(req.business_rules[0].id, /^RULE-\d{3}$/);
  assert.ok(typeof req.business_rules[0].confidence === "number");
});

test("buildDomainModel: only ruled behavior nodes become requirements", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { document } = buildDomainModel(estate);
  // charge + open have rules; refund/settle do not -> 1 req in payments, 1 in accounts
  const reqCount = Object.values(document.domains).reduce((a, d) => a + Object.keys(d.requirements).length, 0);
  assert.equal(reqCount, 2);
});

test("buildDomainModel: metadata carries schema_version + migration_mode", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { document } = buildDomainModel(estate, { migrationMode: "structural" });
  assert.equal(document.metadata.schema_version, "1.0.0");
  assert.equal(document.metadata.migration_mode, "structural");
});
