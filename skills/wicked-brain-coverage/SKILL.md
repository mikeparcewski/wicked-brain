---
name: wicked-brain-coverage
description: |
  Resolved-or-flagged coverage over a codebase's behavior-bearing symbols — the
  provable terminal that crew's build gate (GATE_3) requires to equal 1.0. Every
  behavior-bearing estate SymbolId is either RESOLVED (bound to a rule at/above
  the confidence threshold) or RISK-flagged; a bare node is a coverage hole.
  Doubles as a gate predicate: exits non-zero and lists unaccounted SymbolIds
  when coverage < 1.0.

  Use when: "domain coverage", "coverage report", "rule coverage", "what's
  unaccounted", "is extraction done", "coverage gate", "GATE_3".
---

# wicked-brain:coverage

The coverage engine (`server/lib/coverage.mjs`) computes
`coverage = (resolved + risk_flagged) / behavior_bearing_total` and re-derives
"done" from evidence — it never asserts it. Structure is read ONLY from
wicked-estate (the single structural source of truth); brain no longer ships a
parallel code graph.

## Cross-Platform Notes

Pure JS (ESM), no shell required. Works on macOS, Linux, and Windows. The engine
takes an `EstateClient` (`server/lib/estate-client.mjs`) — the CLI-backed client
shells the `wicked-estate` binary; the fixture client
(`server/lib/estate-client-fake.mjs`) runs it hermetically.

## Inputs / outputs

- **Inputs:** an estate graph (via `EstateClient`) + a config whose
  `coverage.behavior_kinds` / `type_kinds` / `structural_kinds` /
  `estate_behavior_kinds` decide which kinds are behavior-bearing. Kind-sets are
  **config-driven, never hardcoded** (contract §2.5). Defaults live in
  `server/lib/domain-config.mjs`.
- **Output:** a `coverage-report.json` document that validates against
  `@wicked/domain-model-schema` `coverage.schema.json`:
  `{ total, behavior_bearing, resolved, risk_flagged, unaccounted, coverage,
     resolved_rate, mean_confidence, resolve_threshold, per_app, unaccounted_nodes }`.

## Classification (ported from coverage.py `classify_node`)

- **resolved** — a rule at/above `resolve_threshold` (default 0.75) AND the
  in-graph `requirement_validated` bit agrees.
- **risk** — has a requirement/rule but below threshold or unvalidated (HITL queue).
- **unaccounted** — bare: no requirement and no rule. The coverage hole.

A `module` with zero outgoing active edges (`calls`/`uses`/`references`) is a
dead shell and is excluded from the denominator.

## Gate use

`computeCoverage(estate, config)` returns `{ report, ok, unaccounted }`. `ok` is
`false` (and a CLI wrapper exits non-zero, listing `unaccounted`) whenever
`coverage < 1.0`. This is the predicate crew's deterministic GATE_3 validator
re-runs in the worktree with no LLM at gate time.

## PHASE-1 status

Engine + fixture seam + schema validation are implemented and tested. The
server-API / `wicked-brain-call` action wiring and the live `wicked-estate` CLI
integration are the next slice.
