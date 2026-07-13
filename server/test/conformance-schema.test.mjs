import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../lib/schema-validate.mjs";
import { schemas, DOMAIN_MODEL_VERSION } from "../../schemas/index.mjs";
import { conformanceFixture } from "../lib/conformance-fixture.mjs";

const conf = schemas["conformance-rules"];

test("conformance-rules: the fixture bundle validates", () => {
  const errs = validate(conformanceFixture(), conf);
  assert.deepEqual(errs, [], errs.join("\n"));
});

test("bundle: conformance-rules joins the @wicked/domain-model-schema bundle with a versioned $id", () => {
  assert.ok(Object.keys(schemas).includes("conformance-rules"));
  assert.match(conf.$id, /\/conformance-rules\/1\.0\.0$/);
  // Adding a sibling schema is additive -> the bundle semver minor-bumps.
  assert.equal(DOMAIN_MODEL_VERSION, "1.1.0");
});

test("HARDENING: additionalProperties:false at the top level, on metadata, and on a rule", () => {
  assert.equal(conf.additionalProperties, false);
  assert.equal(conf.properties.metadata.additionalProperties, false);
  assert.equal(conf.$defs.rule.additionalProperties, false);
  assert.equal(conf.$defs.targets.additionalProperties, false);
  assert.equal(conf.$defs.provenance.additionalProperties, false);
});

test("HARDENING: metadata.schema_version is a required const '1.0.0'", () => {
  assert.deepEqual(conf.properties.metadata.required, ["schema_version"]);
  assert.equal(conf.properties.metadata.properties.schema_version.const, "1.0.0");
});

test("reject: a missing metadata.schema_version fails validation", () => {
  const doc = conformanceFixture();
  delete doc.metadata.schema_version;
  assert.ok(validate(doc, conf).length >= 1);
});

test("reject: an unknown schema_version fails the const (no silent best-effort)", () => {
  const doc = conformanceFixture();
  doc.metadata.schema_version = "9.9.9";
  const errs = validate(doc, conf);
  assert.ok(errs.some((e) => /schema_version/.test(e) || /const/.test(e)), errs.join("\n"));
});

test("reject: a non-numeric confidence fails validation", () => {
  const doc = conformanceFixture();
  doc.rules[0].confidence = "high";
  const errs = validate(doc, conf);
  assert.ok(errs.some((e) => /confidence/.test(e)), errs.join("\n"));
});

test("reject: an out-of-range confidence fails validation", () => {
  const doc = conformanceFixture();
  doc.rules[0].confidence = 1.5;
  assert.ok(validate(doc, conf).length >= 1);
});

test("reject: an additional property on a rule is not allowed", () => {
  const doc = conformanceFixture();
  doc.rules[0].bogus = true;
  const errs = validate(doc, conf);
  assert.ok(errs.some((e) => /additional property "bogus"/.test(e)), errs.join("\n"));
});

test("reject: a bad rule_type / severity / id pattern fails the enums+pattern", () => {
  const doc = conformanceFixture();
  doc.rules[0].rule_type = "guideline"; // not in enum
  assert.ok(validate(doc, conf).length >= 1);

  const doc2 = conformanceFixture();
  doc2.rules[0].severity = "fatal"; // not in enum
  assert.ok(validate(doc2, conf).length >= 1);

  const doc3 = conformanceFixture();
  doc3.rules[0].id = "RULE-001"; // wrong prefix for a conformance rule
  assert.ok(validate(doc3, conf).length >= 1);
});

test("reject: provenance without source_kinds fails (the shared spine is required)", () => {
  const doc = conformanceFixture();
  delete doc.rules[0].provenance.source_kinds;
  const errs = validate(doc, conf);
  assert.ok(errs.some((e) => /source_kinds/.test(e)), errs.join("\n"));
});

test("$ref: a lone rule validates against #/$defs/rule", () => {
  const rule = {
    id: "POL-010", rule_type: "policy", statement: "x", severity: "warn",
    confidence: 0.6, provenance: { source: "s", ref: "wiki#x", source_kinds: ["doc"] },
  };
  assert.equal(validate(rule, { $ref: "#/$defs/rule" }, conf).length, 0);
});
