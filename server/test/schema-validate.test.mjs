import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../lib/schema-validate.mjs";
import { schemas } from "../../schemas/index.mjs";

test("validate: type mismatch is reported", () => {
  assert.equal(validate(5, { type: "string" }).length, 1);
  assert.equal(validate("x", { type: "string" }).length, 0);
});

test("validate: required + additionalProperties:false", () => {
  const s = { type: "object", required: ["a"], additionalProperties: false, properties: { a: { type: "number" } } };
  assert.equal(validate({ a: 1 }, s).length, 0);
  assert.equal(validate({}, s).length, 1);            // missing a
  assert.equal(validate({ a: 1, b: 2 }, s).length, 1); // extra b
});

test("validate: enum, const, pattern, minItems, min/max", () => {
  assert.equal(validate("keep", { enum: ["keep", "drop"] }).length, 0);
  assert.equal(validate("nope", { enum: ["keep", "drop"] }).length, 1);
  assert.equal(validate("1.0.0", { const: "1.0.0" }).length, 0);
  assert.equal(validate("RULE-001", { type: "string", pattern: "^RULE-[0-9]{3,6}$" }).length, 0);
  assert.equal(validate("RULE-1", { type: "string", pattern: "^RULE-[0-9]{3,6}$" }).length, 1);
  assert.equal(validate([], { type: "array", minItems: 1 }).length, 1);
  assert.equal(validate(1.5, { type: "number", minimum: 0, maximum: 1 }).length, 1);
});

test("validate: $ref resolves against the domain-model $defs", () => {
  const rule = { id: "RULE-001", statement: "x", confidence: 0.9,
    provenance: { source: "s", ref: "sym::x", source_kinds: ["code-body"] } };
  const errs = validate(rule, { $ref: "#/$defs/rule" }, schemas["domain-model"]);
  assert.equal(errs.length, 0);
});

test("validate: if/then drop-reason conditional fires", () => {
  const req = schemas["domain-model"].$defs.requirement;
  const base = {
    title: "t", description: "d", legacy_components: ["sym::x"], data_access: [],
    dependencies: [], business_rules: [{ id: "RULE-001", statement: "s", confidence: 0.9,
      provenance: { source: "s", ref: "sym::x", source_kinds: ["code-body"] } }],
    validations: [], error_paths: [],
  };
  // disposition:drop WITHOUT reason -> fails
  assert.ok(validate({ ...base, disposition: "drop" }, req, schemas["domain-model"]).length >= 1);
  // disposition:drop WITH reason -> passes
  assert.equal(validate({ ...base, disposition: "drop", disposition_reason: "obsolete" }, req, schemas["domain-model"]).length, 0);
});
