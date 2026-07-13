import { test } from "node:test";
import assert from "node:assert/strict";
import { mineVocabulary, tokenize, isAbbreviation } from "../lib/vocabulary.mjs";
import { makeFakeEstateClient, sampleFixtures } from "../lib/estate-client-fake.mjs";
import { validate } from "../lib/schema-validate.mjs";
import { schemas } from "../../schemas/index.mjs";

test("tokenize splits camel/snake/kebab; isAbbreviation flags short all-caps", () => {
  assert.deepEqual(tokenize("openAccount"), ["open", "account"]);
  assert.deepEqual(tokenize("account_id_ACH"), ["account", "id", "ACH"]);
  assert.ok(isAbbreviation("ACH"));
  assert.ok(!isAbbreviation("account"));
});

test("mineVocabulary: output validates against vocabulary.schema.json", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { vocabulary } = mineVocabulary(estate);
  const errs = validate(vocabulary, schemas.vocabulary);
  assert.deepEqual(errs, [], errs.join("\n"));
});

test("mineVocabulary: two axes are proposed/unverified with blank definition", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { vocabulary } = mineVocabulary(estate);
  for (const t of vocabulary.terms) {
    assert.equal(t.status, "proposed");
    assert.equal(t.verification, "unverified");
    assert.equal(t.definition, "");
  }
  // entities (class names) and actions (function/method names) are both mined
  const types = new Set(vocabulary.terms.map((t) => t.term_type));
  assert.ok(types.has("entity"));   // Account
  assert.ok(types.has("action"));   // chargeCard / openAccount / ...
});

test("mineVocabulary: meta counters agree with terms[]", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const { vocabulary } = mineVocabulary(estate);
  assert.equal(vocabulary.meta.term_count, vocabulary.terms.length);
  assert.equal(vocabulary.meta.vocabulary_version, "1.0");
});

test("mineVocabulary: minFreq filters low-recurrence terms", () => {
  const estate = makeFakeEstateClient(sampleFixtures());
  const all = mineVocabulary(estate, { minFreq: 1 }).vocabulary.terms.length;
  const freq2 = mineVocabulary(estate, { minFreq: 2 }).vocabulary.terms.length;
  assert.ok(freq2 <= all);
});
