---
name: wicked-brain-vocabulary
description: |
  Two-axis domain glossary miner over a codebase's symbol names. Proposes terms
  (entities, actions, abbreviations, domain concepts) with two orthogonal axes:
  status (proposed|confirmed — is the TERM real) and verification
  (unverified|untrusted_verified|trusted_verified — is its MEANING proven against
  code). Proposes; never coins meaning.

  Use when: "domain glossary", "mine vocabulary", "domain terms", "ubiquitous
  language", "what are the domain nouns/verbs", "confirm a term", "glossary".
---

# wicked-brain:vocabulary

The vocabulary engine (`server/lib/vocabulary.mjs`) is a frequency miner over
estate node names. It reads names ONLY from wicked-estate and emits a glossary
that validates against `@wicked/domain-model-schema` `vocabulary.schema.json`.

## Cross-Platform Notes

Pure JS (ESM), no shell required. Works on macOS, Linux, and Windows. Takes an
`EstateClient`; the fixture client runs it hermetically for tests.

## The two orthogonal axes (kept exactly from the donor)

- **status** ∈ `{proposed, confirmed}` — is the TERM a real domain item.
- **verification** ∈ `{unverified, untrusted_verified, trusted_verified}` — is
  the term's DEFINITION proven against CODE LOGIC.

Bootstrap emits every term as `status: proposed`, `verification: unverified`,
with a **blank** definition. Only a `trusted_verified` definition may be
asserted as fact in a rule statement. Promotion and definition-authoring are
downstream human/agent steps — the miner never coins meaning.

## Mining

Kind-sets are config-driven (`server/lib/domain-config.mjs`):
- `type_kinds` → `entity` terms (class/interface/struct/...).
- `behavior_kinds` → `action` terms (function/method verbs).
- `structural_kinds` → tokenized field names → `abbreviation` (short all-caps)
  or `domain_concept`.

`freq` is the true recurrence count; `minFreq` filters low-signal terms. Output
`meta` carries `vocabulary_version` (independent of the bundle semver) plus
`term_count` / `confirmed_count` / `trusted_count`.

## Projection (the estate bind — PHASE-2)

Confirmed terms will project onto their grounding estate nodes as
`domain_entity` / `domain_action` k/v annotations (`--replace`, namespaced
provenance `brain:vocab@<ver>`) so estate's own `clusters` / `by-requirement`
become term-aware. Domain resolution lives in the estate graph, not a brain
sidecar. The `EstateClient.annotate()` write path is in place; the confirm→bind
loop is the next slice.

## PHASE-1 status

Miner + two-axis emission + schema validation are implemented and tested.
Confirm/verify promotion and the estate projection loop are stubbed for PHASE-2.
