import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMAIN_MODEL_VERSION, schemas } from "../../schemas/index.mjs";

// Smoke test for the @wicked/domain-model-schema bundle entry point
// (PR #90 hardening ask) + the schema-hardening the bots requested.

test("index.mjs loads the bundle version from the VERSION file", () => {
  assert.equal(DOMAIN_MODEL_VERSION, "1.1.0");
});

test("index.mjs exposes the four sibling schemas, each with a versioned $id", () => {
  assert.deepEqual(Object.keys(schemas).sort(), ["conformance-rules", "coverage", "domain-model", "vocabulary"]);
  assert.match(schemas["domain-model"].$id, /\/domain-model\/1\.0\.0$/);
  assert.match(schemas.vocabulary.$id, /\/vocabulary\/1\.0\.0$/);
  assert.match(schemas.coverage.$id, /\/coverage\/1\.0\.0$/);
  assert.match(schemas["conformance-rules"].$id, /\/conformance-rules\/1\.0\.0$/);
});

test("schemas object is frozen (single source of truth, not mutable)", () => {
  assert.ok(Object.isFrozen(schemas));
});

test("HARDENING: domain-model + coverage close top-level additionalProperties", () => {
  assert.equal(schemas["domain-model"].additionalProperties, false);
  assert.equal(schemas["domain-model"].properties.metadata.additionalProperties, false);
  assert.equal(schemas.coverage.additionalProperties, false);
});

test("HARDENING: legacy_components description names the source_components synonym", () => {
  const desc = schemas["domain-model"].$defs.requirement.properties.legacy_components.description;
  assert.match(desc, /source_components/);
  assert.match(desc, /SAME concept|SYNONYM/i);
});
