# RET-BRAIN-DOMAIN-001 — Retirement of brain's JS domain/conformance SQLite stores

**Decision (owner, 2026-07-13):** the domain-modeling + conformance data belongs in **estate's graph**
via `wicked-core/wicked-apps-core` (the Rust apps), not brain's `better-sqlite3` tables. **No
coexistence.** This record retires the misplaced stores and captures what is SALVAGED as the port spec.
Full corrected design: `wicked-core/.product/DES-OUTGOV-001`. Fork analysis: brain memory
`[[domain-brain-architecture-fork]]`.

## Retired (this PR)
- **12 modules** (`server/lib/`): `domain-store`, `domain-model`, `coverage`, `vocabulary`,
  `domain-config`, `conformance-store`, `conformance-ingest`, `conformance-frameworks`,
  `conformance-fixture`, `estate-client`, `estate-client-fake`, `schema-validate` — all confirmed
  **orphaned** (the live `server/bin/` imports none of them).
- Their **12 test files**.
- **Migrations 7 + 8** excised from `server/lib/sqlite-search.mjs` (were inline in the live file; head
  migration is now 6). Dead `domain_*`/`conformance_*` tables persist harmlessly in any existing
  `.brain.db` (gitignored → no committed data). `gen-contract-schema` migration-count test → `[1..6]`.
- Targeted deletion, NOT `git revert #92` — that PR also deleted the old `@colbymchenry/codegraph`, which
  must stay deleted.

## KEPT — the wire contract (do not delete)
`schemas/` bundle (`@wicked/domain-model-schema` @ VERSION 1.1.0): `domain-model`, `vocabulary`,
`coverage`, `conformance-rules` `.schema.json` + `index.mjs` + `package.json`. Self-contained (loads JSON
from disk, no code deps). Guarded by `schemas-smoke.test.mjs`. This is the serde/validation boundary the
Rust engine + garden's vendored copy consume. (Garden's vendor + drift test are unaffected — the schema
did not move.) **Follow-up:** harden garden's drift test to fail-not-skip when the canonical path is
absent (currently `pytest.skip` = fails open).

## SALVAGE — port spec for the Rust re-home (recover exact code from git history of this branch)
Invariants + algorithms to port into the Rust engine (`wicked-governance` PR-B / domain-graph builder PR-D):

- **Invariants (fail-closed at write):** domain-store **INV-1** (a requirement with **0 business_rules is
  REJECTED** — mark `status:"unresolvable"`, never ship a placeholder), **INV-2** (a business_rule's `confidence`
  must be a number in **[0,1]**, ISS-11), **INV-3** (`disposition:"drop"` WITHOUT a `disposition_reason` is not
  honored by the coverage gate); conformance **INV-C1** (`PAT-*⇔pattern`, `POL-*⇔policy`), **INV-C2**
  (`confidence` number in `[0,1]`), **INV-C3** (rule id unique within the bundle).
- **Coverage predicate:** `coverage = (resolved + risk_flagged) / behavior_bearing == 1.0`, with the
  dead-structural-shell rule (a `module` with zero active out-edges excluded) — `coverage.mjs`.
- **Domain-model assembly:** `buildDomainModel` = cluster → capability domain (never file-derived for
  mainframe; **package-dir boundary for modern code**, per DES-OUTGOV-001 M5) → requirements → business
  rules; confidence-less annotations are DROPPED (stay a coverage hole), never fabricated.
- **Vocabulary miner:** the two-axis (canonical/term-type) miner — `vocabulary.mjs::mineVocabulary`.
- **Ingest / source-connector seam** (`conformance-ingest.mjs`): `{name, ingest()}` adapter interface,
  filesystem adapter shipped, Confluence/SharePoint stubbed; `normalizeDoc` fails loud on missing
  `rule_type`/`statement` (never fabricates); reads nested `targets{}`/`compliance{}`.
- **Compliance-framework seam** (`conformance-frameworks.mjs`): `ComplianceFramework {name, resolve(id)}`,
  config-driven no-op default, `registerFramework`/`loadFramework` registry — real SOC2/PCI drop in later.
- **Recall shape** (`conformance-store.recallRules`): facet wildcard-or-equal (NULL facet = applies to all),
  severity-ranked (critical-first) then id — becomes estate graph queries `find_symbols{kinds:[Rule]}` /
  `annotations_by_type` / `traverse{Governs}`.
- **estate CLI contract used:** `clusters --json --summary`, `resolve --json`, `nodes --json --semantics`
  (requirement/requirement_validated/rule_confidence/out_edges) — these estate surfaces (estate#59/#61) are
  KEPT; the Rust builder consumes them (or reads the graph in-process via `wicked-apps-core`).
