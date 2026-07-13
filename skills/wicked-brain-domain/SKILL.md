---
name: wicked-brain-domain
description: |
  Assemble a domain model — domains and their requirements — from a codebase's
  estate clusters and the business rules bound onto their members. Domains derive
  from estate Louvain communities; every domain fact stores a SymbolId reference,
  never a copy of the symbol's code. Emits the shared domain-model document and
  persists it relationally.

  Use when: "build domain model", "requirements graph", "domain map",
  "capability model", "what are the domains", "assemble requirements",
  "domain-model engine".
---

# wicked-brain:domain

The domain-model engine (`server/lib/domain-model.mjs`) groups estate clusters
into domains, turns rule-annotated behavior nodes into requirements, and emits a
document that validates against `@wicked/domain-model-schema`
`domain-model.schema.json@1.0.0`. Structure is read ONLY from wicked-estate.

## Cross-Platform Notes

Pure JS (ESM). Works on macOS, Linux, and Windows. Takes an `EstateClient`; the
fixture client runs it hermetically for tests.

## What it builds

- **Domains** derive from estate Louvain communities (`clusters --json
  --summary`). Each domain records its community index as advisory `cluster_id`
  provenance — NOT authoritative.
- **Requirements** are behavior-bearing members that carry ≥1 `business_rule`
  annotation. A behavior node with no rule is a coverage hole, not a placeholder.
- **Entities** are type-kind members; their fields are structural members in the
  same file.
- **Business rules** map an estate annotation → a schema Rule with `id`
  (`RULE-NNN`), `statement`, numeric `confidence ∈ [0,1]`, and
  `provenance{source, ref, source_kinds}` where **`ref` is the estate SymbolId**.

## Invariants (enforced at persist, `server/lib/domain-store.mjs`)

1. A requirement with 0 `business_rules` is rejected (mark `status:"unresolvable"`).
2. A business rule with NULL/non-numeric `confidence` is rejected (ISS-11).
3. A `disposition:"drop"` without a `disposition_reason` is not honored by the
   coverage ledger — it can never silently launder past the gate.

## Persistence

`persistDomainModel(db, {document})` normalizes the document into the Migration-7
tables (`domain_models`, `domains`, `requirements`, `rules`, `rule_provenance`,
`rule_symbol_refs`, `entities`, ...) — NOT a blob. `rule_symbol_refs` stores the
SymbolId reference only; to render a rule's code, brain calls estate live
(`source <symbol_id>`). Idempotent per `model_id` (replace, not stack).

## PHASE-1 status

Engine + relational persistence (Migration 7) + write-time invariants + schema
validation are implemented and tested against the fixture estate. The
server-API action wiring, the live `wicked-estate` CLI integration, and
`data_access`/`dependencies` mining are the next slice.
