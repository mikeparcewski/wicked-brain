<!-- CHECKED-IN CANONICAL REFERENCE — do not edit lightly. -->

> **Normative cross-product contract.** This is the checked-in canonical copy of the Domain-Brain shared-spine contract that governs the four disjoint per-product build workflows (estate GROUNDS · brain EQUIPS · garden STEERS · crew GOVERNS). Contract 1 (§1–§6) is normative for the versioned schema bundle `@wicked/domain-model-schema@1.0.0` that lives in `wicked-brain/schemas/` — a build workflow that violates a MUST here is non-conformant and fails cross-product review. brain owns the schema package and this document; the other three products import/vendor the schema and treat this contract as the fixed boundary they build and mock against.

---

# Domain-Brain — Shared Spine Contracts (v1)

> Canonical cross-product contract for the domain & requirements brain build.
> estate GROUNDS · brain EQUIPS (owns schema+engine) · garden STEERS (skills) · crew GOVERNS (workflow).
> The only thing crossing repo lines: a document validating @wicked/domain-model-schema@1.0.0 + a SymbolId string.

---

# CONTRACT 1 — Canonical Domain-Model Schema (`wicked.domain-model` **v1.0.0**)

The single shared data contract that estate, crew, garden, and brain all reference. It is the generic, config-driven successor to anti-legacy's `requirements-graph.enriched.schema.json`. This spec is normative; where it says MUST, a build workflow that violates it is non-conformant and the cross-product review (per `wicked-ecosystem-cross-review` memory) fails.

Everything below is grounded in real donor/target code with `file:line`. Donor paths under `archived/anti-legacy/` are **read-only reference to PORT, not import**.

---

## 0. The four-way seam (why this contract exists)

The Govern→Steer→Equip→Ground loop splits one artifact across four repos. The contract is the fixed boundary that lets each build workflow run **disjoint**, mocking the other three:

| Product | Role | Owns, against this contract |
|---|---|---|
| **brain** | domain-model **ENGINE + STORES** | Owns the schema file itself (§1), the SQLite persistence (§4), the domain-model/vocabulary/coverage engines. MUST delete its parallel code-graph (`server/lib/codegraph-*.mjs`, e.g. `codegraph-client.mjs:1-40` opens its own `nodes`/`edges` SQLite via `docs/codegraph-contract.md`) and read structure **only** from estate (§3). |
| **estate** | **GROUNDS** | Owns `SymbolId` identity, the graph, Louvain clustering (`community.rs:347`), the `clusters` CLI (`main.rs:1400`), and the native `requirement` annotation write-path. Provides the *targets* every domain fact points at. Never stores requirements-graph JSON. |
| **garden** | **EQUIPS** | Owns the extraction SKILLS that *emit* documents conforming to this schema, plus the advisory `modernize`/`specify` archetype. Produces the artifact; brain validates + stores it. |
| **crew** | **GOVERNS** | Owns the gated WorkflowDef (§5) that sequences garden's extraction and enforces gates on the stored document. Ports anti-legacy's `manifest.py` gate state machine. |

**Disjoint-build rule:** the only thing that crosses repo boundaries is a *document that validates against `domain-model.schema.json@1.0.0`* and a *SymbolId string*. Each side mocks the others with a fixture document + fixture SymbolIds. No side imports another's code.

---

## 1. Where the schema lives & how it is versioned (requirement **d**)

**brain owns a versioned schema package; the other three import it.**

```
wicked-brain/
  schemas/                         ← NEW, brain-owned, the source of truth
    domain-model.schema.json       ← $id: "https://wickedagile.com/schemas/domain-model/1.0.0"
    vocabulary.schema.json         ← $id: ".../vocabulary/1.0.0"
    coverage.schema.json           ← $id: ".../coverage/1.0.0"
    VERSION                        ← "1.0.0"  (single line; the semver of the bundle)
    index.mjs                      ← exports { DOMAIN_MODEL_VERSION, schemas } for JS importers
```

- Published as the npm package **`@wicked/domain-model-schema`** (brain is JS/ESM already — `wicked-brain/CLAUDE.md`). **crew** and **garden** (both JS/TS) add it as a normal dependency. **estate** (Rust) vendors a copy pinned by the same git tag and gates drift with a byte-compare test in CI (estate already vendors external assets; this is the same discipline as `languages.toml` being data).
- **Version is semver on the bundle**, embedded three ways so validation is uniform:
  1. Each schema's `$id` ends in the version (`.../domain-model/1.0.0`).
  2. Every emitted document MUST carry `metadata.schema_version = "1.0.0"` (see §2). A consumer that reads a document rejects a `schema_version` it doesn't have a validator for — no silent best-effort.
  3. brain's SQLite records it per row (`domain_models.schema_version`, §4).
- **This contract semver is distinct from brain's SQLite DB migration integer** (`_schema_version`, `sqlite-search.mjs:345-349`). The mapping is one row in the schema package: `1.0.0 → brain DB migration 7` (§4). Bump rules: additive optional field = **patch** (no migration); new required field or table = **minor** (new numbered migration, back-compat read of old docs); invariant change / field removal = **major** (new `$id`, dual-read window).

Rationale for brain owning it (not estate): the schema is the *domain model*, brain's core noun; estate is deliberately domain-agnostic (`wicked-estate/CLAUDE.md`: "Rules as DATA … a new language should be a new grammar + query file, zero core change"). Putting domain vocabulary in estate would violate that. crew/garden are consumers of the model, not its authority.

---

## 2. The schema (requirement **a**) — `domain-model.schema.json`

Draft-07, `type: object`, `required: ["domains"]` — same spine as the donor enriched profile (`requirements-graph.enriched.schema.json:7`). Below is the **generic** adaptation. Field names and the hard invariants are preserved from the donor; the COBOL/CICS-specific vocabulary is replaced with config-driven equivalents.

### 2.1 Top level

| Field | Type | Constraint |
|---|---|---|
| `metadata` | object | `required: ["schema_version","migration_mode"]`. `schema_version` = const-checked semver (new vs donor). `migration_mode ∈ {structural, functional}` (ported from `...enriched...:100`; `functional` = capability-grouped, the default; `structural` = 1:1). `source` (optional) = the repo/service the model was mined from. |
| `domains` | object (map) | **REQUIRED.** Keys are domain slugs; each value is a Domain. Mirrors donor `domains` map (`...enriched...:103-107`). |

### 2.2 Domain (`domains.*`)

`required: ["requirements","entities"]` (ported verbatim from `...enriched...:107`).

| Field | Type | Constraint |
|---|---|---|
| `requirements` | object (map) | Keys = requirement ids; values = Requirement (§2.3). |
| `entities` | object (map) | Keys = entity names; each `required: ["description","fields"]`, `fields[]` each `required: ["name","type","description"]` (ported from `...enriched...:156-176`). |
| `description` | string | optional (new, generic; domains gain a human label). |
| `cluster_id` | integer | optional. The estate Louvain community index this domain was derived from (§3.3). NOT authoritative — advisory provenance. |

### 2.3 Requirement (`requirements.*`) — the heart

`required: ["title","description","legacy_components","data_access","dependencies","business_rules","validations","error_paths"]` — ported from `...enriched...:113-122`. **`legacy_components` is renamed-compatible as `source_components`** but the key stays `legacy_components` in v1.0.0 for zero-churn porting; treat the two as synonyms, prefer `source_components` in prose. It is the list of estate SymbolIds/names this requirement covers (§3).

| Field | Type | Constraint |
|---|---|---|
| `title`, `description` | string | required. |
| `legacy_components` | string[] | required, **non-null, ≥0 but never dropped** (`wicked-estate/CLAUDE.md`-style invariant; anti-legacy Universal Don'ts: "Don't drop … legacy_components"). Each entry SHOULD be a resolvable estate node name or SymbolId. |
| `data_access` | string[] | required. Data resources touched (table/collection/store names — generic, was DB2/IMS). |
| `dependencies` | string[] | required. Other requirement ids / external services. |
| `business_rules` | Rule[] | required, **`minItems: 1`** (HARD INVARIANT, ported from `...enriched...:129-133`). A requirement with zero rules is a placeholder — mark `status:"unresolvable"` with a reason instead. |
| `validations` | Validation[] | required (may be empty). |
| `error_paths` | ErrorPath[] | required (may be empty). |
| `status` | enum | `active \| review \| unresolvable` (`...enriched...:142`). |
| `disposition` | enum | **`keep \| modify \| drop \| new`** (HARD INVARIANT, ported from `...enriched...:144-148`). Merge+reimagine disposition vs target state. |
| `disposition_reason` | string | **MANDATORY when `disposition:"drop"`** for the drop to be honored by the coverage gate (`...enriched...:149-152`). A reason-less drop still counts against coverage. |
| `merged_programs` | string[] | optional (`...enriched...:143`). |

### 2.4 Rule / Validation / ErrorPath (the `$defs`)

**These are OBJECT-ONLY in v1.0.0** (the donor enriched profile dropped the transitional string form — `...enriched...:5`). Ids are `RULE-`/`VAL-`/`ERR-` + `[0-9]{3,6}` zero-padded, **unique within a requirement** (`requirements-graph.schema.json:5`; widen past 3 digits automatically for dense communities). The canonical global key is `legacy_component + "#" + id` (e.g. `payments-svc:charge#RULE-002`, `requirements-graph.schema.json:5`).

**Rule** — `required: ["id","statement","confidence","provenance"]`:

| Field | Type | Constraint |
|---|---|---|
| `id` | string | `^RULE-[0-9]{3,6}$` (`...enriched...:14`). |
| `statement` | string | `minLength:1`. |
| `confidence` | **number** | **REQUIRED, `minimum:0, maximum:1`** (HARD INVARIANT — ISS-11; `...enriched...:11,17`). A confidence-less or non-numeric-confidence rule is a hard validation failure, not a warning. |
| `provenance` | object | **REQUIRED** (tightened vs donor, where it was optional). Shape below. |
| `source_ref` | string | optional (`...enriched...:16`). |

**`provenance`** — `required: ["source","ref","source_kinds"]` (generalized from the donor's `{source_app, program, ref, source_kinds}`, `...enriched...:18-33`):

| Field | Type | Constraint |
|---|---|---|
| `source` | string | The origin unit the fact came from — repo / service / module (replaces COBOL `source_app`+`program`). |
| `ref` | string | The specific reference within the source (file#anchor, symbol, or estate SymbolId). |
| `source_kinds` | string[] | **The grounding tier of each fact.** Generic enum (adapted from `...enriched...:25-31`): `code-body` (executable logic read directly) · `type-def` (type/schema/struct/interface/DB-schema declaration — generalizes COBOL `data-def`) · `comment` (inline prose) · `doc` (README/external). **Trust rule (ported verbatim, `...enriched...:26`):** a rule is `trusted` only when grounded in `code-body` and/or `type-def`; resting on `comment`/`doc` alone makes it RISK-eligible. |

**Validation** — `required: ["id","statement"]`; `id ^VAL-[0-9]{3,6}$`; optional `field`, `error_ref ^ERR-[0-9]{3,6}$` (intra-requirement join to an ErrorPath — the round-trip check, `...enriched...:45`), optional `confidence`, optional `provenance` (same shape; confidence/provenance stay **optional** here — `...enriched...:5`).

**ErrorPath** — `required: ["id","statement"]`; `id ^ERR-[0-9]{3,6}$`; optional `code` (return/status code surfaced), optional `confidence`, optional `provenance`.

### 2.5 Config-driven miner kind-sets (the genericization mandate)

The donor hardcoded COBOL kinds. v1.0.0 makes them **data**, resolved from config, matching the ported `coverage_kinds(config)` mechanism (`vocabulary.py:250-262`). A conformant emitter (garden) MUST read these from `config.coverage.*`, never hardcode:

| Config key | Feeds | v1.0.0 generic default (modern JS/TS/Rust) |
|---|---|---|
| `coverage.behavior_kinds` | domain **actions/verbs**, the behavior-bearing predicate | `["module","function","method"]` (`vocabulary.py:200`) |
| `coverage.type_kinds` | domain **entities/nouns** | `["class","interface","struct","trait","enum","record"]` (`_DEFAULT_TYPE_KINDS`, `vocabulary.py:192`) |
| `coverage.structural_kinds` (∩ noun-bearing) | field-level nouns/abbreviations | `{"field","variable"}` (`vocabulary.py:206`) |
| `coverage.estate_behavior_kinds` | estate object-kinds naming entities verbatim (mainframe/IaC only) | `[]` for a pure modern repo; `["db2_table","cics_program","step"]` on a mainframe estate (`vocabulary.py:201`) |

Rule: **"no kind is hardcoded as a domain signal — the config is the single source of which kinds mean what"** (`vocabulary.py:65-68`). This is what makes the same contract serve a COBOL estate and a Rust monorepo.

### 2.6 Sibling schemas in the same versioned bundle

The domain-model document is the primary artifact; two siblings share its version and its store:

- **`vocabulary.schema.json`** (ported from `archived/anti-legacy/schemas/vocabulary.schema.json`): `required: ["terms","meta"]`. Each `term` `required: ["canonical","term_type","status","verification","freq"]` (`vocabulary.schema.json:41`), with the **two orthogonal axes** kept exactly: `status ∈ {proposed, confirmed}` (is the term real, `:70`) and `verification ∈ {unverified, untrusted_verified, trusted_verified}` (is its definition proven against code, `:75`). `term_type ∈ {entity, action, abbreviation, domain_concept}` (`:51`). A `source.kind ∈ {graph_node, doc, human}` where **`graph_node.ref` is the full estate SymbolId** (`:114`) — see §3. `meta.vocabulary_version` (`:18`) tracks term-set evolution independently of the bundle semver.
- **`coverage.schema.json`** (new; formalizes anti-legacy's `coverage-report.json`, `coverage.py`): the resolved-or-flagged ledger. Every behavior-bearing estate SymbolId is either RESOLVED (bound to ≥1 rule) or RISK-flagged — never bare. Carries `rule_coverage ∈ [0,1]`; **crew's GATE_3 requires `= 1.0`** (§5).

---

## 3. How a domain fact references an estate symbol — NOT copies it (requirement **c**)

**Invariant: a domain fact stores a `SymbolId` *reference*, never a copy of the symbol's code, name-uniqueness, file, or line.** estate is the sole authority for structure; brain projects onto it.

### 3.1 The identity being referenced

- The reference key is estate's **`SymbolId`** — the stable interned identity from `crates/wicked-estate-core/src/symbol.rs`, **never a content-hash or line number** (ADR-002, `wicked-estate/CLAUDE.md`). This is why the reference survives a rename or reindex: names are not unique (carddemo `MAIN-PARA` ×21 — `wicked_estate.py:18`), the SymbolId is.
- The write path is estate's stable CLI: `semantics <symbol_id> --requirement … --description … --validated …` (`wicked_estate.py:13-14`). **Passing a bare name is a SILENT NO-OP** (0 rows updated, reports success — `wicked_estate.py:16-19`). So every write MUST first resolve name→SymbolId via `resolve_symbol_id` — the ONE documented read-only raw-SQLite exception, against the ADR-002-locked `symbols(sym)` intern table (`wicked_estate.py:20-24, 855-876`).

### 3.2 The reference payload (the "annotation key")

Two coordinated writes per bound fact (ported from `annotate()`, `wicked_estate.py:1006-1075`), both keyed by SymbolId, neither copying symbol structure:

1. **Native projection into estate** (in-graph, so estate queries see it): the compact **tagged requirement string** — convention `"<rule_id>|<confidence>|<provenance>|<statement>"` (`wicked_estate.py:1044`) — plus `requirement_validated = 1` (RESOLVED at/above threshold) or `0` (RISK) (`wicked_estate.py:1046`). Reverse lookup via `by-requirement <REQ>` (`wicked_estate.py:1092`).
2. **brain's own store** (§4): a `rule_symbol_refs` row `{rule_id, db_id, symbol_id, validated, cluster_id}`. **`symbol_id` is the full interned SymbolId string; brain stores NOTHING else about the symbol** — no name, no file, no source text. To render a rule's code, brain calls estate live (`source <symbol_id>`). This is the anti-legacy overlay row keyed `{db_id, symbol_id}` (`wicked_estate.py:25-28`), minus the mainframe IP sidecar.

The traceability thread is: estate node (native `file`/`line`) → `rule_symbol_refs.symbol_id` → `business_rules[].id` → `legacy_components[]` → crew task → UAT verdict. A broken link means a downstream worker can't trace to source; that is a gate failure, not a warning.

### 3.3 Grounding domains in estate clustering

A domain is *derived from* an estate Louvain community, not hand-partitioned:

- `detect_communities(store, CommunityParams{ min_size, include_singletons, resolution, hierarchical, package_bias })` (`community.rs:347, 29-44`) over **only `Calls`/`Imports` edges** (`community.rs:269, 344-346`), deterministic (no RNG, SymbolId order — `community.rs:13-17`).
- Surfaced by the `clusters` CLI: `clusters [min_size] [--json] [--weight louvain|semantic] [--resolution] [--hierarchical] [--package-bias] [--annotate]` (`main.rs:1400-1452`). With `--annotate` it stamps a **cache-class** annotation on each member: `type="community", key="community", value=<community index>, provenance="clusters:louvain:res=<r>"`, replace-not-accumulate (`main.rs:1460-1484`).
- brain records that index as `domains.*.cluster_id` and `rule_symbol_refs.cluster_id` — **advisory provenance only**. Quality signals estate exposes and brain may surface: `modularity()` (good partition `> 0.3`, `community.rs:428-429`) and `max_community_fraction()` (mega-community regression if `≥ 0.30`, `community.rs:484, 791`).

---

## 4. How it maps to brain's SQLite tables (requirement **b**)

brain persists the JSON document relationally, **inside its existing migration discipline** — not as a blob. The discipline (`wicked-brain/CLAUDE.md`, "Schema migrations required"): a numbered, idempotent step in `SqliteSearch.#migrate()` (`sqlite-search.mjs:343`), gated on the single-row `_schema_version` table (`sqlite-search.mjs:345-349, 440-441`); `CREATE TABLE IF NOT EXISTS` for new tables + `ALTER TABLE … ADD COLUMN` (behind a `try { SELECT col } catch` probe, `sqlite-search.mjs:355-437`) for new columns — because `CREATE TABLE IF NOT EXISTS` never adds columns to an existing DB. Current DB version is **6** (`sqlite-search.mjs:432-437`); the domain-model lands as **Migration 7**, and `1.0.0 → DB-migration 7` is the mapping recorded in the schema package (§1). The contract-API generator (`gen-contract-schema.mjs:5-6`) picks the new `CREATE TABLE`s + the migration ladder up automatically — do not hand-edit its output.

**Migration 7 DDL (normative shape):**

```sql
-- if (currentVersion < 7) { ... currentVersion = 7; }
CREATE TABLE IF NOT EXISTS domain_models (        -- one row per emitted document
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, brain_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,                   -- "1.0.0" — §1 rule 3
  migration_mode TEXT NOT NULL,                   -- structural|functional
  source TEXT, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY, model_id TEXT NOT NULL, domain_key TEXT NOT NULL,
  description TEXT, cluster_id INTEGER);          -- estate Louvain index (§3.3)

CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY, domain_id TEXT NOT NULL, req_key TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT NOT NULL,
  status TEXT, disposition TEXT, disposition_reason TEXT);

CREATE TABLE IF NOT EXISTS requirement_components (  -- legacy_components/data_access/dependencies/merged_programs
  requirement_id TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL,
  rule_kind TEXT NOT NULL,                         -- business_rule|validation|error_path
  rule_id TEXT NOT NULL,                           -- RULE-/VAL-/ERR-NNN (unique within requirement)
  statement TEXT NOT NULL,
  confidence REAL,                                 -- NOT NULL enforced for business_rule at write (§2.4)
  field TEXT, error_ref TEXT, code TEXT, source_ref TEXT);

CREATE TABLE IF NOT EXISTS rule_provenance (
  rule_id TEXT PRIMARY KEY, source TEXT NOT NULL, ref TEXT NOT NULL,
  source_kinds TEXT NOT NULL);                     -- JSON array: code-body|type-def|comment|doc

CREATE TABLE IF NOT EXISTS rule_symbol_refs (       -- §3.2 — REFERENCE ONLY, never copies symbol
  rule_id TEXT NOT NULL, db_id TEXT NOT NULL, symbol_id TEXT NOT NULL,
  validated INTEGER DEFAULT 0, cluster_id INTEGER);
CREATE INDEX IF NOT EXISTS idx_rulesym_symbol ON rule_symbol_refs(symbol_id);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, domain_id TEXT NOT NULL, entity_key TEXT NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS entity_fields (
  entity_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, description TEXT);

CREATE TABLE IF NOT EXISTS vocabulary_terms (       -- vocabulary.schema.json
  id TEXT PRIMARY KEY, model_id TEXT NOT NULL, canonical TEXT NOT NULL,
  term_type TEXT NOT NULL, definition TEXT,
  status TEXT NOT NULL, verification TEXT NOT NULL, freq INTEGER NOT NULL, mined_from TEXT);
CREATE TABLE IF NOT EXISTS term_sources (
  term_id TEXT NOT NULL, kind TEXT NOT NULL,        -- graph_node|doc|human
  ref TEXT NOT NULL, node_kind TEXT, file TEXT, freq INTEGER);

CREATE TABLE IF NOT EXISTS coverage_ledger (        -- coverage.schema.json / GATE_3
  model_id TEXT NOT NULL, symbol_id TEXT NOT NULL,
  resolved INTEGER NOT NULL, rule_id TEXT, risk_reason TEXT);
```

**Write-time invariants brain MUST enforce (validation, not just DDL):** reject a `requirements` insert with 0 `rules[rule_kind='business_rule']` (mirrors `minItems:1`); reject a `business_rule` with NULL/non-numeric `confidence` (ISS-11); reject a `disposition='drop'` with NULL `disposition_reason` from counting as covered. Optional FTS mirror: reuse the existing `documents_fts` pattern (`sqlite-search.mjs:298-304`) to index `rules.statement` for search — additive, not required for v1.0.0.

Store location follows brain's existing convention: `~/.wicked-brain/projects/{project}/.brain.db` (`wicked-brain/CLAUDE.md`).

---

## 5. The crew WorkflowDef binding (gate machine → workflows-as-data)

crew ports anti-legacy's `manifest.py` gate state machine into a `WorkflowDef`. The contract fixes the two gates that read the domain-model store:

- **GATE_3 (build) — coverage `= 1.0`.** Auto-clears on evidence: build-integrity `PASS` **and** round-trip `rule_coverage ≥ 1.0` from the `coverage_ledger` (`coverage.py` exits non-zero listing unaccounted SymbolIds when `< 1.0`). Every behavior-bearing estate SymbolId must be RESOLVED or reason-flagged.
- **GATE_4 (UAT) — evaluator ≠ creator.** Structural separation: the agent that runs tests is not the agent that judges them (crew's core invariant; anti-legacy's 3-agent acceptance pipeline). A gate is recorded `passed` only with ≥1 registered evidence artifact (`manifest.py:343-431`); `passed`/`failed`/`waived` are the only opinions (`manifest.schema.json:107`) — there is no `approve`/`rejected`.
- **Kick-back semantics to preserve:** recording a gate `failed` rewinds `phase.current` to that gate's producing phase via the inverse map `GATE_PRODUCING_PHASE` (`manifest.py:70`), the forward preconditions live in `GATE_PHASE_PRECONDITIONS` (`manifest.py:50`), and it exits non-zero (code 3) so the orchestrator branches — it does **not** auto-dispatch the re-run.
- **Artifact registry to preserve:** every stored document is registered with `depends_on` lineage + a SHA-256 `checksum` (`manifest.schema.json:91-97`) so a drifted/orphaned domain-model is detectable (anti-legacy's disk-reality reconcile).

crew never parses the domain-model JSON's *content*; it reads brain's `coverage_ledger.rule_coverage` and gate evidence ids. That keeps crew disjoint from brain's schema internals.

---

## 6. The disjoint-build boundary (what each side mocks, what no side may relax)

**Mock surface (so four workflows run in parallel):**
- **brain** builds against fixture `domain-model@1.0.0` documents + fixture SymbolId strings; mocks estate's `resolve_symbol_id`/`source` CLI with a stub returning canned SymbolIds.
- **garden** builds against the schema (emits documents), mocks brain's store endpoint and estate's `clusters`/`list_nodes` output with fixtures.
- **crew** builds against brain's `coverage_ledger` + gate API shape, mocks the whole document.
- **estate** builds against nothing new — it already exposes `clusters`, `semantics`, `resolve_symbol_id`; it just must keep those signatures stable and pass the vendored-schema byte-compare test.

**Hard invariants no build workflow may relax (the cross-review checklist):**
1. `domains` is required; every domain has `requirements` + `entities`.
2. `business_rules.minItems = 1` per requirement.
3. Every `business_rule` carries **numeric `confidence ∈ [0,1]`** and **`provenance{source, ref, source_kinds}`**.
4. `disposition ∈ {keep, modify, drop, new}`; `drop` needs `disposition_reason` to be honored by coverage.
5. A domain fact stores a **SymbolId reference**, never a copy of symbol structure; the reference resolves through estate, and estate is the only writer of graph structure (brain deletes its parallel codegraph).
6. Miner kind-sets are **config-driven** (`config.coverage.*`), never hardcoded.
7. All three schemas share one bundle semver; every document/row declares `schema_version`; a consumer rejects an unknown version rather than best-efforting it.

**Ground-truth file:line index (for the four build workflows to re-verify against):** enriched schema `archived/anti-legacy/schemas/requirements-graph.enriched.schema.json:7,11,14,17,26,100,113-122,129-133,144-152,156-176`; base schema `.../requirements-graph.schema.json:5,45`; vocabulary `.../vocabulary.schema.json:41,51,70,75,105-114`; estate clustering `wicked-estate/crates/wicked-estate-rank/src/community.rs:13-17,29-44,269,347,428-429,484,791`; clusters CLI `wicked-estate/crates/wicked-estate/src/main.rs:1400-1484`; estate annotation seam `archived/anti-legacy/skills/anti-legacy-expert/scripts/antilegacy_core/wicked_estate.py:13-28,855-876,1006-1092`; config-driven kinds `.../vocabulary.py:65-68,192,200-206,250-262`; brain migration discipline `wicked-brain/server/lib/sqlite-search.mjs:273-442`, contract-gen `.../gen-contract-schema.mjs:5-6`; brain parallel codegraph to delete `wicked-brain/server/lib/codegraph-client.mjs:1-40`; gate machine `archived/anti-legacy/skills/anti-legacy-expert/scripts/antilegacy_core/manifest.py:50,70,343-431`, gate/artifact schema `archived/anti-legacy/schemas/manifest.schema.json:91-97,107`.

---

# CONTRACT 2 — The Estate Surface (the read/write seam the brain engine calls)

**Status of ground truth:** verified against wicked-estate v0.13.1 source (not the v0.0.1 the anti-legacy Python seam was written against — several of that seam's "gotchas" are now obsolete, flagged inline). Every claim below cites `file:line`.

**One-line transport verdict:** brain talks to estate over **CLI shell-out** for v1 (it is the *only* surface that carries full cluster membership and the *only* surface with an annotation-write path — MCP has neither). Estate must ADD three things (§4) to make a JSON/MCP surface viable; until then the CLI is the contract. This mirrors the proven anti-legacy seam (`archived/anti-legacy/.../antilegacy_core/wicked_estate.py`), minus its raw-SQLite exception, which v0.13.1 makes unnecessary.

---

## 1. What estate exposes TODAY (the inventory brain builds against)

Two disjoint transports exist, and they are **not** interchangeable:

| Capability | CLI (`wicked-estate <cmd>`) | MCP tool | Trait method |
|---|---|---|---|
| Detect communities (full members) | `clusters --json [--summary]` ✅ | `Communities` ❌ (drops members) | `detect_communities` (`rank/community.rs:347`) |
| Read cluster summaries | `clusters --json --summary` ✅ | `Communities` ✅ (summary only) | `summarize_communities` (`rank/cluster_summary.rs:92`) |
| Write `requirement` link (single-valued) | `semantics <id> --requirement …` ✅ | ❌ none | `set_node_semantics` (`core/traits.rs:230`) |
| Write typed k/v annotation (multi-valued) | `annotate --symbol <id> --key … --value …` ✅ | ❌ none | `annotate` (`core/traits.rs:241`) |
| Read annotations for a symbol | `annotations --symbol <id> --json` ✅ | via `RetrieveEntity` payload ✅ | `annotations` (`core/traits.rs:171`) |
| Reverse: symbols with requirement R | `by-requirement <R>` ✅ (no id, no `--json`) | ❌ | `find_by_requirement` (`core/traits.rs:166`) |
| Reverse: symbols with annotation K[=V] | `nodes --annotated-with K[=V] --json` ✅ | ❌ | `find_by_annotation` (used at `main.rs:2095`) |
| Resolve name → SymbolId | `nodes --json` / `source <name> --json` ✅ (scrape) | ❌ | — (no dedicated method) |

**The MCP surface has NO graph-annotation write tool.** All 23 MCP tools are 10 estate *read* tools + 6 `memory.*` + 7 `knowledge.*`; the only writers are `memory.*`/`knowledge.*` (`mcp/lib.rs:751-768`). Graph annotation/semantics writes are **CLI-only** (`main.rs:1333`, `main.rs:1621`).

---

## 2. (a) READ CLUSTERS — the exact shape brain consumes

### The engine primitive
`detect_communities(&dyn GraphRead, &CommunityParams) -> Result<Vec<Vec<SymbolId>>>` (`rank/community.rs:347`). Properties brain can rely on:

- Membership is defined **only** by `Calls` + `Imports` edges (`community.rs:269`); all other edge kinds are ignored.
- **Deterministic** — no RNG, nodes processed in SymbolId order (`community.rs:13-17`, `:356`). Same graph + same params ⇒ byte-identical partition.
- Returned **largest-community-first**, tiebroken by the lexicographically smallest SymbolId (`community.rs:412-416`).
- `CommunityParams { min_size, include_singletons, resolution, hierarchical, package_bias }` (`community.rs:29-44`); defaults `min_size=2, singletons=off, resolution=1.0, hierarchical=false, package_bias=0.0` (`community.rs:47-55`).

### CLI `clusters` — the shape brain MUST use for membership
Signature (`main.rs:1400`, usage `main.rs:1391-1393`, arg-parse `main.rs:511-548`):
```
wicked-estate clusters [<min_size>] [--json] [--summary] [--annotate]
    [--resolution <γ>] [--hierarchical] [--package-bias <f>]      # graph (Louvain)
    [--weight semantic [--k <n> | --eps <d> --min-pts <n>]]       # semantic (embeddings)
    [--db <path>]
```

Three output shapes:

1. **`clusters --json` (bare)** — array of arrays of SymbolId strings (`main.rs:1523-1528`):
   ```json
   [ ["sym::a","sym::b","sym::c"], ["sym::d","sym::e"] ]
   ```
   Index into the outer array = the cluster id (largest-first). This is the minimal membership feed.

2. **`clusters --json --summary`** (graph mode only; `--summary` ignored under `--weight semantic`) — per-community objects, **the recommended read for brain** (`main.rs:1506-1521`):
   ```json
   [ { "id": 0,
       "size": 12,
       "members": ["sym::a", "sym::b", "..."],          // FULL member SymbolId list
       "label_candidates": ["sym::a","sym::b"],          // ≤5 top-PageRank members
       "dominant_files": ["src/foo/bar.rs"],             // ≤3 by member count
       "modularity_contribution": 0.071 }, ... ]
   ```
   `label_candidates` = `CommunitySummary.top_symbols` (`cluster_summary.rs:59`), `dominant_files` (`cluster_summary.rs:66`), `modularity_contribution` = the additive Newman–Girvan per-community term (`cluster_summary.rs:68-72`; summing all terms == global `modularity()`).

3. **`clusters` (text, no `--json`)** — `"N communities (graph, min_size=M, modularity=Q.QQQ):"` then per cluster `"cluster i: N symbols"` + up to 5 members (`main.rs:1531-1550`). Brain should **not** parse this; use `--json`.

### The MCP `Communities` tool is INSUFFICIENT for brain
Request `{ limit(def 20,max 200), min_size(def 2), resolution(def 1.0) }`; response content (`retrieve/lib.rs:1414-1448`):
```json
{ "communities": [ { "size":12, "top_symbols":[…≤5], "dominant_files":[…≤3],
                     "modularity_contribution":0.07 } ], "total":8, "truncated":false }
```
It returns **no `members` list and no cluster `id`** — only the ≤5 `top_symbols` per community (`retrieve/lib.rs:1414-1420`). Brain's domain-model engine needs the *full* membership to attach a domain label to every symbol, so **the MCP tool cannot back brain's cluster read.** Use CLI `clusters --json --summary`.

### Cluster-id stability caveat (load-bearing for brain's store)
The `id` is a **positional index into a freshly recomputed partition** (`main.rs:1512` emits `"id": i`). It is stable ONLY when the tuple `(graph content, --weight, --resolution, --hierarchical, --package-bias, min_size)` is identical between calls. Brain must **not** persist domain labels keyed on `id` across a re-index. Key on a content hash of the sorted member SymbolId set (or wait for estate to emit a stable key — §4.5).

### Companion read: full source for one cluster
`source --cluster <id> --json` returns each member's `{symbol_id, byte_range, blob_sha, signature, source}` (`main.rs:988-1000`, `source_bundle.rs:228-236`) — the bulk body fetch brain uses when it needs to read a cluster's code, budget-bounded via `--max-total-chars` / `--signatures-only`.

---

## 3. (b) READ / WRITE ANNOTATIONS

### 3.0 The name→SymbolId resolution rule (the single most important gotcha)
**Every write keys on the full interned SymbolId string, never the simple name.** Names are not unique (carddemo `MAIN-PARA` × 21). Two failure modes brain must guard:

- **Silent no-op on a wrong/absent id.** `annotate` and `set_node_semantics` are documented no-ops when the symbol is absent (`core/traits.rs:238-241`, `:230`); the CLI `annotate --symbol` path constructs the id raw via `SymbolId::from(sym_str)` with no existence check (`main.rs:1656`). A typo'd id "succeeds" while updating 0 rows. (Confirmed as the anti-legacy scar: `wicked_estate.py:15-24`, `:1042-1047`.)
- **Name-fan-out smear.** CLI `annotate <name>` (positional, no `--symbol`) annotates **every** search hit for that name (`main.rs:1664-1669`). Brain must **always** use `--symbol <id>`, never the name form.

**How brain gets a SymbolId (v0.13.1 — the raw-SQLite exception is obsolete):** the anti-legacy seam used a raw SQLite `symbols(sym) JOIN nodes` read *because v0.0.1 exposed no id and no `--json`* (`wicked_estate.py:17-24`, `:857-910`). That is no longer true. Today:
- `nodes [--kind K] --json` emits `{ symbol_id, name, kind, file, line, signature, annotation_summary, annotations? }` per node (`main.rs:2066-2086`, id at `:2069`). Brain enumerates and filters client-side by `(name, file, kind)` to disambiguate.
- `source <name> --json` emits `symbol_id` per matching node (`source_bundle.rs:228`).
- `query <name>` does **NOT** have `--json` and does not emit id (human lines only, `main.rs:780-815`) — do not use it for resolution.

SymbolId is **stable across renames** (ADR-002; annotations follow the symbol, not line/content — `core/traits.rs:239-240`), so a resolved id is durable.

### 3.1 There are TWO annotation surfaces — brain uses both for different jobs

**Surface 1 — SEMANTICS (single-valued native columns).** One `requirement`, one `description`, one `requirement_validated` bool per symbol. Partial update: each `Some(..)` writes its column, `None` leaves it (`core/traits.rs:230-236`).
- Write: `wicked-estate semantics <symbol_id> [--description X] [--requirement Y] [--validated true|false] --db <db>` (`main.rs:1333-1372`). `<symbol_id>` is treated as a raw SymbolId (silent no-op if unknown).
- Read one: `semantics <symbol_id>` prints `symbol/description/requirement/validated` as **text only — no `--json`** (`main.rs:1354-1369`).
- Reverse: `by-requirement <R>` → `find_by_requirement` (`main.rs:1374-1387`, trait `core/traits.rs:166`). **Text only, emits name/file/line, NO symbol_id, NO `--json`.**
- **Use for:** the single canonical requirement↔symbol link (the "this symbol satisfies REQ-x" spine).

**Surface 2 — TYPED K/V ANNOTATIONS (multi-valued, evidence-enveloped).** Many rows per symbol, each `(type, key, value, confidence, provenance, author, ts, source_type, extraction_method, last_verified)` (`core/annotation.rs:130-165`). A bare INSERT, not an upsert — same symbol carries many (`core/traits.rs:238-241`).
- **This is where brain's `domain_entity` / `domain_action` / `business_rule` live.** They are k/v annotations because they need per-fact `confidence` + `provenance` + `type` and multiple-per-symbol semantics — exactly the Surface-2 shape. `domain_entity`/`domain_action`/`business_rule` are **custom `type` values**, first-class and stored/queried identically to the known set (`annotation.rs:8-9`, `:52-53`). Known types are only `note/assumption/observation/comment/question/community` (`annotation.rs:25-32`) — brain's three are custom, which is fully supported.
- Write: `wicked-estate annotate --symbol <id> --key <K> --value <V> [--type <T>] [--confidence <F>] [--provenance <P>] [--author <A>] [--replace] --db <db>` (`main.rs:1621-1690`; flags parsed `main.rs:446-481`).
  - **`--replace`** makes it an idempotent UPSERT by `(type, key)` — delete-then-insert (`main.rs:1643-1651`, trait `delete_annotations` `core/traits.rs:246`). **Brain MUST pass `--replace` for re-projectable domain facts** so a re-index replaces rather than stacks duplicates (the anti-legacy "annotation stacking" hardening, `wicked_estate.py:1230-1246`).
  - `ts=0` on write ⇒ store stamps it (`annotation.rs:180-181`).
- Read one: `annotations --symbol <id> [--type <T>] --json` → `{ "symbol": <id>, "annotations": [ {type,key,value,confidence,provenance,author,ts,advisory}, … ] }` (`main.rs:1703-1748`, `:1717-1724`). `--type` filters to that exact type (`main.rs:1712-1713`). Not R4-capped (direct read).
- Reverse: `nodes --annotated-with <K>` or `<K>=<V> --json` → `find_by_annotation`, **emits `symbol_id`** (`main.rs:2088-2098`, `:2069`). This is the reverse lookup brain uses for "every symbol tagged `domain_entity=Account`".
- Freshness: `annotations_stale_since(cutoff)` / `stale-annotations <cutoff> --json` (`core/traits.rs:184`, `main.rs:1786`) — the re-verification window for domain facts.

### 3.2 The k/v value + envelope convention brain must write
For a domain annotation brain writes, per resolved SymbolId:
```
annotate --symbol <id> --type domain_entity   --key domain_entity   --value "Account" \
         --confidence 0.91 --provenance "brain:vocab@<ver>" --author brain --replace
annotate --symbol <id> --type domain_action   --key domain_action   --value "PostTransaction" \
         --confidence 0.88 --provenance "brain:vocab@<ver>" --author brain --replace
annotate --symbol <id> --type business_rule    --key business_rule    --value "<rule text or rule-id>" \
         --confidence 0.79 --provenance "brain:extract@<ver>" --author brain --replace
```
- `confidence` ∈ [0,1], default 1.0 for human-asserted (`annotation.rs:136-137`). Brain-derived facts should carry a real sub-1.0 confidence.
- `provenance` is a free-form origin string (`annotation.rs:138-139`); estate itself uses `"clusters:louvain:res=1.0"` for its own community tags (`main.rs:1475`). Brain should namespace its provenance (`brain:<engine>@<ver>`).
- Optionally set the evidence envelope for freshness/audit: `source_type` (∈ code/config/sme-answer/static-analysis/… `annotation.rs:98-106`), `extraction_method`, `last_verified` — these back `annotations_stale_since`. (Note: the CLI `annotate` arm does **not** currently expose `--source-type`/`--extraction-method`/`--last-verified` flags — see §4.4; today they default. Set them via a future flag or the MCP writer estate must add.)

### 3.3 What estate writes on its own (the `community` cache brain reads)
`clusters --annotate` writes, on every member of every detected community: `type=community, key=community, value=<cluster-index>, author=system, provenance="clusters:louvain:res=<γ>"` (or `"clusters:semantic"`), as an UPSERT (delete-then-insert, `main.rs:1470-1494`). Brain can read this back via `annotations --symbol <id> --type community --json` to learn estate's grouping without recomputing — but note `value` is the same volatile positional index as §2's caveat.

---

## 4. (c) TRANSPORT — recommendation + what estate MUST ADD

**Recommendation for v1: CLI shell-out, wrapped in a thin brain-side client** modeled on `antilegacy_core/wicked_estate.py` (subprocess, text mode, per-command timeout, no `shell=True`, cross-platform — `wicked_estate.py:36`, `:188-218`). This is forced, not preferred: the MCP surface **cannot** back brain because (1) `Communities` omits members (`retrieve/lib.rs:1414-1420`) and (2) there is **no MCP annotation writer at all** (`mcp/lib.rs:751-768`). The CLI is the only surface that satisfies both the read (full members via `clusters --json --summary`) and the write (`annotate --symbol` / `semantics`).

Brain builds its side against the **fixed CLI contract** in §2–§3 and mocks it (a fake `EstateClient` returning canned `clusters --json --summary` payloads and recording `annotate --symbol` calls). Estate's disjoint workflow implements/blesses that CLI surface. Neither side blocks the other.

**What estate MUST ADD (ranked; each is what unblocks a cleaner contract):**

1. **Full membership + stable id on a JSON cluster read.** Either extend the `Communities` MCP tool to return `members: [symbol_id]` + `id` (today dropped, `retrieve/lib.rs:1414-1420`), or formally bless `clusters --json --summary` as the stable contract shape. Brain depends on `members`; do not let its JSON drift.
2. **A first-class name→SymbolId resolve surface:** `wicked-estate resolve <name> [--file F] [--kind K] --json → [{symbol_id, name, kind, file, line}]`. Today brain must scrape `nodes --json` and filter client-side (`main.rs:2066-2086`). A dedicated command kills the raw-SQLite temptation permanently and makes the write path's precondition (a valid id) obtainable in one call.
3. **MCP write tools** `estate.annotate` and `estate.semantics` (only needed if brain should write over MCP instead of CLI). Today CLI-only (`main.rs:1621`, `:1333`); the MCP crate has only `memory.*`/`knowledge.*` writers (`mcp/lib.rs:751-768`). Optional if CLI shell-out is accepted for v1.
4. **`--json` + `symbol_id` on `by-requirement`**, and evidence-envelope flags (`--source-type`/`--extraction-method`/`--last-verified`) on `annotate`. `by-requirement` is text-only with no id today (`main.rs:1379-1385`); `nodes --annotated-with --json` covers the k/v reverse case with ids but not the Surface-1 `requirement` column.
5. **A content-derived stable cluster key** (e.g. a hash of the sorted member SymbolIds) emitted alongside the volatile positional `id` (`main.rs:1512`), so brain's domain-model store can key clusters durably across re-index. Absent this, brain owns the hashing and documents the cache key as `(graph digest, weight, resolution, hierarchical, package_bias, min_size)`.

---

## 5. The fixed contract (what runs disjoint across the four workflows)

Freeze exactly this so estate / brain / garden / crew each build and mock against it:

**Estate PROVIDES (estate's workflow implements / keeps green):**
- `clusters --json --summary` → array of `{id, size, members:[symbol_id], label_candidates, dominant_files, modularity_contribution}` (`main.rs:1506-1521`). Members are the load-bearing field.
- `nodes --json` and/or new `resolve` → `symbol_id` for a `(name, file, kind)` (`main.rs:2066-2086`).
- `annotate --symbol <id> --type <T> --key <K> --value <V> --confidence <F> --provenance <P> --author <A> --replace` → idempotent typed-annotation upsert (`main.rs:1621-1690`).
- `semantics <id> --requirement <R> --validated <bool>` → single requirement link (`main.rs:1333-1372`).
- `annotations --symbol <id> --json` and `nodes --annotated-with K[=V] --json` → reads back with ids (`main.rs:1703`, `:2088`).
- Determinism + largest-first ordering + rename-stable ids are part of the contract (`community.rs:13-17,412-416`; ADR-002).

**Brain CONSUMES (brain's workflow implements / mocks the above):**
- Reads `clusters --json --summary`, hashes member sets into durable cluster keys, attaches domain labels.
- Resolves every write target name→SymbolId first (guards the silent-no-op).
- Writes `domain_entity` / `domain_action` / `business_rule` as `--type`-tagged, `--replace`d k/v annotations with real confidence + namespaced provenance; writes the primary requirement link via `semantics`.
- **Deletes its parallel `@colbymchenry/codegraph`** and reads all structure from this surface only (per the task's division of labor).

**Mock boundary (so the four builds run parallel):** a single `EstateClient` interface with methods `read_clusters(params) -> [Community]`, `resolve(name, file?, kind?) -> [symbol_id]`, `annotate(symbol_id, type, key, value, confidence, provenance, replace)`, `set_requirement(symbol_id, requirement, validated)`, `read_annotations(symbol_id) -> [Annotation]`, `find_by_annotation(key, value?) -> [symbol_id]`. Brain codes against the interface; the CLI-backed impl and a fixture impl are swappable. Estate's workflow only has to keep the six CLI shapes above stable and green.

---

# CONTRACT 3 — Crew's Governed Domain-Extraction WorkflowDef + Invocation Protocol

**Scope.** How wicked-crew (on the wicked-core engine) runs the front-half domain-extraction pipeline (`survey → analyze → extract → coverage → domain-graph`, gated on `coverage == 1.0`) as a governed, data-defined workflow that invokes **garden** extraction skills and the **brain** domain-model engine, grounds on **estate**, and gates on coverage + evaluator≠creator. This is crew's *disjoint-workflow* contract: it fixes crew's surface precisely enough that garden, brain, and estate each build against it while mocking the others.

**Division being contracted (from the task):** crew owns the **governed gated workflows** (anti-legacy's `manifest.py` gate state machine → a crew `WorkflowDef`); garden owns the **extraction skills**; brain owns the **domain-model engine + stores** (net-new JS ports of `coverage.py` / `extract.py` / `domain_graph.py` / `vocabulary.py`); estate **grounds** (graph + Louvain clustering + requirement annotations).

---

## 1. The fixed crew surface (what already exists — the thing the other three mock against)

Everything in this section is built in `wicked-core` today. The other three products treat it as immutable.

### 1.1 Workflows are DATA, not code (Law 2)

- A workflow is `WorkflowDef { id, phases: Vec<PhaseDef> }` — `wicked-core/src/workflow.rs:307`. Pure data; `#[serde(deny_unknown_fields)]` so a typo is a loud parse error, not a silent default (`:306`).
- A `PhaseDef` (`workflow.rs:206-255`) carries every field the reducer dispatches on — never a match on the workflow `id` or a phase name:
  - `kind: StageKind` — `recon | build | review | test` (`domain.rs:207-219`), taken from the phase, never keyword-guessed.
  - `gate_type: Option<GateType>` — the `value | strategy | execution` ladder position (`workflow.rs:147-156`); `null` = ungated.
  - `gate: GateSpec` — `Auto | HumanConfirm{unconditional} | HumanConfirmIf(GateCond)` (`workflow.rs:170-187`); `GateCond::VerdictNotPass` auto-advances on PASS, pauses a human only on non-PASS (`:159-164`).
  - `executes_code`, `verified_evidence`, `required_deliverables: Vec<String>` (fail-closed structural check — `:228-229`), `depends_on: Vec<String>`.
  - `role: PhaseRole` — `Neutral | Creator | Evaluator` (`workflow.rs:192-201`), the evaluator≠creator split.
  - `skill_ref: Option<String>` + `allowed_skills: Vec<String>` — the headless skill that drives the phase and its least-privilege runtime scope (`:236-244`).
  - `validator_pin: Option<String>` — content-hash of an **approved** deterministic validator in the vault; loaded fail-closed at plan time (`:246-254`, README `workflows/README.md:55-66`).
- Registration is a drop-in JSON file: `WorkflowRegistry::load_dir` overlays every `*.json`, validating each (`workflow.rs:438`); `with_defaults()` seeds `feature`/`bug`/`migration` (`:405-411`). **A new workflow is a data file, zero core edit.**
- Validation: non-empty, unique ids, **backward-only `depends_on`** (declaration order = execution order = a valid topological order; a cycle can't even be expressed) — `workflow.rs:352-393`.
- `plan_from_def(def, intent, session_id)` derives one `WorkUnit` per phase and carries `kind`/`skill_ref`/`allowed_skills`/`gate`/`role` onto the unit (`plan.rs:44-89`, specifically `:75-85`). The `WorkUnit` also carries `validator: Option<DeterministicValidator>` (`domain.rs:189`) and `phase_ref` (`:154`).

### 1.2 The gate model (dual gate, deny-dominates, done-re-derived-from-evidence)

- **Gate ladder** (`DES-EXEC-001-event-driven-workflow-execution.md:435-450`): (1) deterministic evidence — re-run the pinned verifier, **never trust cached status**; (2) structural — `required_deliverables` present; (3) governance deny-dominates. `Verdict = f(1,2,3)` only. The engagement dial selects **WHO** confirms, never **WHAT** the verdict is.
- **Dual validator** (`src/validator.rs`): the deterministic floor `run_validator` re-runs an **approved** shell script in the phase worktree with **no LLM at gate time**, fail-closed on unapproved/dangerous/timeout (`:659-702`); the agent judge `agent_validate` renders a semantic PASS/REJECT under a **distinct council seat** (`:807-857`); `combine_verdict` = **Approve iff deterministic PASS ∧ agent ≠ REJECT** — a model can fail a gate but never solely approve one (`:920-927`); `gate_phase` composes them (`:945-969`).
- **Validator vault** (`src/validator_vault.rs`): `pin` is a content-hash over `criterion + script + approved` (`:37-46`) — a swapped script can never reuse an approved pin; `load_validator` re-hashes and refuses a tamper mismatch (`:87-119`). Authoring (`provision_validator`, `:125`) vaults **UNAPPROVED**; approval is a separate audited step (`approve_and_store`, `:138`) — the approved copy has a distinct pin, and that pin is what a phase carries.
- **Deny-dominates, side-effect-ordered** (`src/execute.rs:64-146`): a validator/evaluator deny is folded into the gate resolution **before** the phase resolves and **before** any `work_output` is written (`:109-146`); the `WORK_OUTPUT` node is written **only on approval** (`:18`, `:137`), so a denied unit leaks no approved output. The `UnitOutcome` records `evaluator_claim_id` — proof of a real seat-distinct second pass (`:37`).

### 1.3 The execution-mediation seam + event catalog (Law 1)

- `task.dispatched → cli-runner → task.completed` (`src/cli_runner.rs:78-80`). The reducer publishes `wicked.crew.task.dispatched {skill_ref, allowed_skills, workdir, cli, role, attempt, unit}`, a `cli-runner` subscriber runs the unit off-actor via the same `StepRunner`, and publishes `wicked.crew.task.completed` back (`:304-352`, `:489-612`). Opt-in `WICKED_BUS_EXEC`; the default stays in-process (`:9`, `DES-EXEC-001:409-418`).
- **The evaluator≠creator seat guarantee is structural, not a label** (`cli_runner.rs:192, 232-237`): the agent judge is dispatched under a seat whose identity is distinct from **both** the deterministic-validator author **and the work's own author** (`assigned_cli`) — it can never self-grade under the seat that wrote the work.
- The approved validator's shell **script is never serialized onto the bus** — only its `criterion` + content-address pin ride; the gate re-verifies the script from the actor's own store (`cli_runner.rs:87-92, 120-129`).
- Idempotency: deterministic key `hash(event_type, run_id, unit_ix, attempt)` gives exactly-once effect over at-least-once delivery (`cli_runner.rs:174-182`).
- Event catalog (`DES-EXEC-001:347-365`) includes `wicked.crew.evidence.recorded {evidence_kind, envelope_hash}` and the skill-provisioning pair `wicked.crew.skill.needed → wicked.crew.skill.ready` (`:519-525`).
- Skills are invoked headless, spike-verified: `claude -p "/<skill-name> …"` expands the SKILL.md deterministically (`DES-EXEC-001 §4.1`, F9 `:132-145`). A `SkillRef` is data **but must carry its runtime contract** (required plugin, evidence format, enforcement level) which the cli-runner validates/provisions — F11 (`DES-EXEC-001:152-155`).

---

## 2. (a) The domain-extraction WorkflowDef shape

This is the map of anti-legacy's `manifest.py` gate state machine (`PHASE_ENUM` `manifest.py:97-119`; exit-gated `GATE_PHASE_PRECONDITIONS` `:50-57`; kick-back `GATE_PRODUCING_PHASE` `:70-84`) onto a single crew `WorkflowDef`. The hand-rolled phase state machine **becomes data** (Law 2): the phase enum → the phases vector; the advance-precondition-on-exit → `depends_on` + the gate firing after each phase; the human/auto gate distinction → `GateSpec`.

**Workflow id:** `domain-extraction`. Registered as a drop-in `workflows/domain-extraction.json` (`load_dir`, `workflow.rs:438`) — no core edit.

**Phases** (declaration order = execution order; each `depends_on` its predecessor):

| Phase id | `kind` | `role` | `gate_type` | `gate` | `executes_code` / `verified_evidence` | `skill_ref` (garden) | `validator_pin` | `required_deliverables` |
|---|---|---|---|---|---|---|---|---|
| `survey` | `recon` | Neutral | `null` | `auto` | false / false | `wicked-garden-survey` | — | `legacy-graph.digest.txt` |
| `analyze` | `recon` | Neutral | `null` | `auto` | false / false | `wicked-garden-analyze` | — | `analysis-report.json` |
| `extract` | `recon` | **Creator** | `value` | `auto` | false / false | `wicked-garden-extract` | — | `annotations.jsonl` |
| `coverage` | `test` | **Evaluator** | `execution` | `human_confirm_if: verdict_not_pass` | false / **true** | `wicked-garden-coverage-review` | **`<approved coverage==1.0 pin>`** | `coverage-report.json` |
| `domain-graph` | `build` | Neutral | `strategy` | `human_confirm` | false / false | `wicked-garden-domain-graph` | — | `requirements_graph.json` |

Notes that make this normative:

- **The coverage gate (anti-legacy GATE_3, `rule_coverage ≥ 1.0`).** The `coverage` phase carries `verified_evidence: true` and a `validator_pin` to an **approved** `DeterministicValidator` whose `criterion` = "resolved-or-flagged coverage == 1.0 (zero unaccounted behavior-bearing nodes)" and whose `script` re-derives coverage from evidence and exits 0 iff `coverage == 1.0`. This ports `coverage.py` exactly: coverage `= (resolved + risk_flagged) / behavior_bearing_total`, DoD `== 1.0`, **exit non-zero + list unaccounted SymbolIds when `< 1.0`** (`coverage.py:10-14, 795-803`). At the gate, crew's `run_validator` re-runs that script in the worktree with no LLM (`validator.rs:659`), and **deny dominates** (`execute.rs:109-146`) — a `< 1.0` result drives the phase `Rejected` and writes no `work_output`. `gate: human_confirm_if: verdict_not_pass` mirrors anti-legacy's "GATE_3 auto-clears on evidence, human only on fail."
- **The evaluator≠creator attestation (anti-legacy GATE_4 posture).** `extract` is `role: Creator` (it produces the rule IP — the annotations). `coverage` is `role: Evaluator`: its agent-judge half reads the **cold** `coverage-report.json` + `annotations.jsonl` as `work`, dispatched under a seat **distinct from the extraction creator's seat** (`cli_runner.rs:232-237`). The attestation crew records is the `evaluator_claim_id` on the `coverage` unit's `UnitOutcome` (`execute.rs:37`) — a machine-checkable proof that a real, seat-distinct second pass judged the extraction, never a self-grade. `combine_verdict` guarantees the coverage validator (deterministic) must PASS **and** the evaluator seat must not REJECT (`validator.rs:920`).
- **`domain-graph` runs only after the coverage gate passes** — `depends_on: [coverage]`, and the backward-only DAG rule (`workflow.rs:352-393`) makes that ordering structural. This is anti-legacy's "don't build the target requirements graph until coverage is a provable terminal" (`domain_graph.py:21-26`).
- **Human gates map by `GateSpec`.** Anti-legacy's human gates (GATE_1_DESIGN, GATE_2_PLAN — `manifest.py` requires a human) → `GateSpec::HumanConfirm`; the `domain-graph` design gate is `human_confirm` (the design-review checkpoint). Automated evidence gates (GATE_3) → `Auto`/`HumanConfirmIf` + `validator_pin`. Anti-legacy's rule "no skill/script/agent may synthesize a human gate" is already crew's invariant: the engagement dial selects WHO confirms, never the verdict (`DES-EXEC-001:439-441`).
- **Structural evidence check.** Anti-legacy's `cmd_gate` refuses a PASS unless every cited evidence id is a registered artifact that content-verifies — exists, checksum matches, status not failed/pending (`manifest.py:359-386`, `_verify_evidence:160-189`). That maps to crew's `required_deliverables` fail-closed structural layer (`workflow.rs:228`, ladder-2 `DES-EXEC-001:444`) plus the deterministic re-verify (ladder-1). The per-phase `required_deliverables` column above is the crew form of anti-legacy's per-gate evidence-id list.

---

## 3. (b) The invocation protocol — a crew phase → garden skill + brain engine, evidence back

There are **two seams**, and keeping them separate is what lets garden and brain build disjoint.

### Seam A — crew → garden skill (execution), via the existing dispatch path

1. The reducer plans the run (`plan_from_def`, `plan.rs:44`) and, for each phase, publishes `wicked.crew.task.dispatched` carrying `{ skill_ref = "wicked-garden-<phase>", allowed_skills, workdir = <run worktree>, cli, role, attempt, unit }` (`cli_runner.rs:304-352`; catalog `DES-EXEC-001:357`).
2. The `cli-runner` subscriber invokes the seat headless: `claude -p "/wicked-garden-<phase> …"` with the garden plugin loaded and `allowed_skills` as the tool/skill scope (`DES-EXEC-001 §4.1-4.2`). If the garden skill or the brain-engine tool is missing/stale, the runner publishes `wicked.crew.skill.needed` and blocks as `AwaitingSkill` until `wicked.crew.skill.ready` (`DES-EXEC-001:519-525`) — never a synchronous fetch.
3. The skill runs in `workdir`, produces work-output text + touches files, and the runner publishes `wicked.crew.task.completed { output, status, agent_verdict?, files }` (`cli_runner.rs:566-591`). Crew folds it into `apply_step_result` on the single-writer actor.

**Garden's obligation against this seam:** ship `wicked-garden-{survey,analyze,extract,coverage-review,domain-graph}` skills, each a headless `/`-invocable SKILL.md whose declared inputs are `{ workdir, estate_db_path, config }` and whose declared outputs are the phase's `required_deliverable` file(s) written into `workdir` **plus** a binary work-output the gate can judge. Garden mocks brain + estate behind the engine CLI contract (Seam B).

### Seam B — garden skill → brain engine + estate (inside the dispatched process)

Crew does **not** call brain directly during execution. The garden skill, running in the crew-dispatched process, drives the brain engine, which reads structure from estate. This is the port of anti-legacy's injected-extractor architecture (`extract.py:80-104`): the **engine owns the deterministic loop**, the **skill injects the LLM rule-statement step**.

- **estate grounds (read-only structure).** The brain engine reads the graph via the estate CLI/seam — `index`, `list_nodes`, `rank`, `clusters` (Louvain community detection), `context`, `source_bundle`, and writes `requirement` annotations via `annotate` (anti-legacy's `wicked_estate.py:9-28`; `list_nodes:923`, `rank:831`, `cluster:1757`, `context:1983`, `annotate:1007`). Brain **MUST delete its parallel `@colbymchenry/codegraph` and read structure only from estate** — estate is the single structural source of truth (anti-legacy CLAUDE.md §H).
- **brain engine (the net-new JS ports).** The skill calls, in order:
  - `wicked-brain domain extract --db <estate_db> --config <cfg>` (port of `extract.py:295-342`): cluster once, build the rank-ordered behavior worklist, per node compute cluster cohesion, apply the sprawl penalty (`extract.py:33-43, 209-224`), call the **skill-supplied LLM extractor** for the rule statement + confidence, and resolve-or-RISK to a terminal — writing `annotations.jsonl` + the estate native `requirement` field atomically (`extract.py:705-784`). "No silent maybe-correct": below-threshold ⇒ RISK-flag, never assert.
  - `wicked-brain coverage compute --db <estate_db> [--check]` (port of `coverage.py`): `coverage = (resolved + risk_flagged)/behavior_bearing_total` over the config-driven behavior-bearing denominator (`coverage.py:209-234`, `classify_node:389-449`); writes `coverage-report.json`; `--check` exits non-zero listing unaccounted SymbolIds when `< 1.0` (`coverage.py:795-803`).
  - `wicked-brain domain build --db <estate_db> --overlay annotations.jsonl` (port of `domain_graph.py`): the §I5 target requirements graph from the live estate + overlay, capability domains from `clusters(weight="calls")` (`domain_graph.py:2-46, 92`), round-trip no-silent-drop, validated against the enriched requirements schema.

**Brain's obligation against this seam:** expose those three engine subcommands with the signatures above (inputs = estate db path + config + overlay + injected extractor; outputs = the deliverable files + a summary). Brain mocks garden's LLM extractor with the deterministic stub (`extract.py:812-824`) and mocks estate with a fixed node-list fixture (the `--nodes` hermetic seam, `coverage.py:320-328`).

### Seam C — crew → brain at the gate (deterministic re-verify, no LLM)

At the `coverage` phase gate, crew re-derives "done" from evidence:

1. crew loads the phase's approved `DeterministicValidator` from the vault by `validator_pin` (fail-closed if unresolved — `validator_vault.rs:87`, `workflow.rs:246-254`).
2. `run_validator` re-runs its script in the worktree — the script is `wicked-brain coverage compute --check` (or a shell assertion over `coverage-report.json`) — exit 0 iff `coverage == 1.0`, **no LLM at gate time** (`validator.rs:659`).
3. In parallel, the evaluator-seat agent judge reads the cold `coverage-report.json` (`cli_runner.rs:216-251`); `combine_verdict` requires deterministic PASS ∧ agent ≠ REJECT (`validator.rs:920`).
4. Deny-dominates and is side-effect-ordered: a `< 1.0` deny drives the phase `Rejected` before any `work_output` is written (`execute.rs:109-146`). On approval, the `work_output` node is recorded and crew emits `wicked.crew.evidence.recorded { evidence_kind: "coverage", envelope_hash }` (`DES-EXEC-001:361`).

**Evidence flow back / the envelope bridge.** Anti-legacy's evidence envelope `{ scope, phase, claim, status ∈ {PASS,FAIL,PARTIAL,WAIVED}, evidence, produced_at, produced_by }` (`evidence-envelope.schema.json:6-35`) maps onto crew's `work_output` node + `ConformanceClaim`: `claim` = the validator criterion, `status` = the combined verdict, `evidence.command/exit_code` = the re-verified script result, `envelope_hash` = the SHA-256 tamper seal crew records. That mapping is the contract seam between anti-legacy's manifest-registered evidence and crew's estate-stored evidence.

---

## 4. (c) What crew must ADD vs what already EXISTS

| Capability | Status | Where |
|---|---|---|
| `WorkflowDef`/`PhaseDef` data model + drop-in JSON loader | **EXISTS** | `workflow.rs:307, 438` |
| `plan_from_def` carrying kind/gate/role/skill_ref/allowed_skills onto units | **EXISTS** | `plan.rs:74-85` |
| Per-phase gate ladder (value/strategy/execution; Auto/HumanConfirm/HumanConfirmIf) | **EXISTS** | `workflow.rs:147-187` |
| evaluator≠creator role split + seat-distinct judge (never self-grade) | **EXISTS** | `plan.rs:83-85`, `cli_runner.rs:232-237` |
| Dual-validator gate: vault/pin/approve + fail-closed no-LLM re-verify + combine rule | **EXISTS** | `validator_vault.rs:37,125,138`; `validator.rs:659,920` |
| Deny-dominates, work_output only on approval, `evaluator_claim_id` attestation | **EXISTS** | `execute.rs:37,109-146` |
| Headless skill invocation + execution-mediation seam + idempotency | **EXISTS** | `DES-EXEC-001 §4.1`; `cli_runner.rs:78-182` |
| Skill provisioning as events (`skill.needed → skill.ready`) | **EXISTS (sidecar smoke-verified)** | `DES-EXEC-001:519-525` |
| **`domain-extraction` WorkflowDef drop-in JSON** (the §2 phase table) | **ADD** (data, not core) | new `workflows/domain-extraction.json` |
| **Author + approve + vault the `coverage == 1.0` DeterministicValidator** (port of `coverage.py --check`) | **ADD** (authored artifact) | `provision_validator`→`approve_and_store`, `validator_vault.rs:125,138` |
| **`SkillRef` entries + cli-runner provisioning for the garden skills AND the brain-engine tool** — the brain engine is a **new JS tool, not a claude skill**; the cli-runner must invoke/provision it with its runtime contract (F11) | **ADD** | per `DES-EXEC-001:152-155` |
| **Evidence-envelope → crew-evidence bridge** — map anti-legacy `{scope,phase,claim,status,evidence}` onto the `work_output` node + `evidence.recorded` envelope_hash, and the **gate-evaluator consumer** of `evidence.recorded` (a designed-but-not-fully-built subscriber) | **ADD** | `evidence-envelope.schema.json:6-35`; `DES-EXEC-001:361,376` |
| **Kick-back on gate FAIL** — anti-legacy rewinds to the gate's *producing phase* and re-runs it (`manifest.py:70-84, 404-416`). Crew today drives the phase `Rejected` and halts; the intra-run "rewind to `extract`, re-run under a bumped attempt" (or a Campaign `OnTerminal` edge) is not yet wired | **ADD** | Campaign composition `DES-EXEC-001 §5:532-543` |

---

## 5. The disjoint-build contract (so the four workflows run in parallel, mocking each other)

Each product implements its side against these fixed interfaces and stubs the rest:

- **crew** implements §2 (the `domain-extraction` WorkflowDef) + §4-ADDs. It mocks garden with a stub `StepRunner` that returns schema-shaped `task.completed` output and writes fixture deliverables; it mocks brain by pointing the coverage `validator_pin` at a fixture script; it mocks estate with a fixture worktree. Proof is a **print-mode run** (no real CLIs) asserting the event sequence + reducer state, exactly as `DES-EXEC-001 §6:554-561` prescribes.
- **garden** implements the `wicked-garden-*` skills whose I/O contract is `{ workdir, estate_db_path, config } → required_deliverable files + binary work-output`. It mocks crew by invoking the skill directly via `claude -p "/wicked-garden-extract …"`, and mocks brain with the deterministic extractor/coverage stubs (`extract.py:812`, `coverage.py --nodes`).
- **brain** implements `wicked-brain {domain extract, coverage compute, domain build, vocabulary}` with the signatures in §3-Seam-B, deletes `@colbymchenry/codegraph`, and reads structure only from estate. It mocks estate with node-list fixtures (`coverage.py:320`) and mocks garden with the stub extractor.
- **estate** grounds: `index / list_nodes / rank / clusters (Louvain) / context / annotate` (`wicked_estate.py:9-28`). It is already stable; the contract only requires it keep the read-side structural CLI + the `requirement` annotation write-path that brain consumes.

**The load-bearing invariants that must not drift across the four builds:** (1) coverage is `(resolved + risk_flagged)/behavior_bearing_total`, DoD `== 1.0`, and the coverage gate is a **deterministic, no-LLM re-verify** in the worktree that deny-dominates; (2) `extract` = Creator, `coverage` = Evaluator, and the judge seat is **provably distinct** from the extraction seat; (3) the brain engine owns the loop, the garden skill injects the LLM rule step, estate owns structure — no product re-implements another's half; (4) capability lands as **data** (the WorkflowDef JSON + the approved validator pin), never a wicked-core edit.

---

# Domain-Brain Contract v1 — the disjoint-build seam for crew · garden · brain · estate

**Purpose.** Pin the interfaces precisely enough that four per-product build workflows run in parallel, each implementing its own side and *mocking* the other three against this fixed contract. Every claim grounded in code carries a `file:line` citation. The loop is **Govern (crew) → Steer (garden) → Equip (brain) → Ground (estate)**.

Contract version pins (independent product SemVer underneath):
- **vocabulary schema** `vocabulary_version = "1.0"` (`archived/anti-legacy/skills/anti-legacy-expert/scripts/antilegacy_core/vocabulary.py:127`)
- **estate CLI/MCP surface** ≥ v0.13 (`semantics`, `by-requirement`, `clusters`) + **annotate-kv replace** ≥ v0.5.1 (`vocabulary.py:748-751`)
- **coverage-report schema** v1 (this contract §2.C)
- **WorkflowDef schema** v1 (this contract §2.D) — *net-new to crew*

---

## 1. Ownership boundaries (who builds what, who mocks what)

| Product | Owns | Ports from anti-legacy donor | Mocks (consumes as fixed) |
|---|---|---|---|
| **estate** (Ground) | code graph (`graph.db`), Louvain `clusters`, `requirement` annotations | nothing — already exists | — (leaf; everything depends on it) |
| **brain** (Equip) | domain-model / vocabulary / coverage **engines + stores** (net-new JS) | `coverage.py`, `vocabulary.py` | estate CLI/MCP; garden's annotation writes |
| **garden** (Steer) | extraction **skills** + advisory **modernize/specify** archetype | `extraction`, `graph-translator`, `negative-extraction`, `adversarial-review`, `antagonist` skills | brain engine calls; estate CLI |
| **crew** (Govern) | governed gated **WorkflowDef** state machine | `manifest.py` gate state machine | brain's `coverage.computed`; garden's evidence |

**The hard deletion (brain).** brain today shells `@colbymchenry/codegraph` to build its own `.codegraph/codegraph.db` — `server/lib/codegraph-resolver.mjs:6` (`const PACKAGE = "@colbymchenry/codegraph"`) and `server/lib/codegraph-index.mjs:6-7` (`dbPath → <source>/.codegraph/codegraph.db`). Under this contract brain **deletes that parallel graph** (resolver/index/extract/nodes/client + `docs/codegraph-contract.md` + the `@colbymchenry` README section) and reads structure **only** from estate's `graph.db`. This is DoD-enforced (§3): a grep for `colbymchenry`/`codegraph.db` in shipped brain code must return zero.

---

## 2. The four fixed seams

### 2.A — estate GROUNDS (the read surface brain/garden mock)

estate is the system-of-record for structure. Its stable surface:

- **Index:** `wicked-estate index` → per-app `graph.db`.
- **Clusters (Louvain):** `wicked-estate clusters [<min_size>] [--json] [--annotate] [--db …]` (`wicked-estate/crates/wicked-estate/src/main.rs:19,1400`). Backend is multi-level Louvain maximizing modularity `Q_γ`, **deterministic, no RNG** (`wicked-estate/crates/wicked-estate-rank/src/community.rs:13-20`, `detect_communities` at `:347`). `--annotate` upserts one `type="community", key="community", value=<largest-first idx>` annotation per member, provenance `clusters:louvain:res=<γ>`, author `system` — a re-projectable cache that **replaces**, never accumulates (`main.rs:1460-1495`). Quality metrics `modularity` (`community.rs:429`) and `max_community_fraction` (`community.rs:484`) are backend-independent.
- **Requirement annotation (the domain link):** `wicked-estate semantics <symbol> [--description X] [--requirement Y] [--validated true|false]` (`main.rs:1331-1366`) writes `NodeSemantics { requirement: Option<String>, requirement_validated: bool }` (`wicked-estate/crates/wicked-estate-core/src/semantics.rs:17-23`).
- **Reverse link:** `wicked-estate by-requirement <req>` → `symbols_for_requirement` (`main.rs:1374-1378`).
- **KV annotation (vocabulary bind target):** `Annotation { type, key, value, confidence, provenance, author, ts }` (`wicked-estate/crates/wicked-estate-core/src/annotation.rs:131-164`); upsert-replace requires estate ≥ 0.5.1.
- **Node enumeration:** `list_nodes(db, kinds=None)` returning `{symbol_id, name, kind, file, out_edges}` — the denominator source brain's coverage/vocabulary engines consume.

**estate invariant (never relaxed):** every node carries native `file`/`line` provenance; every edge carries `{confidence, provenance, resolved_by}` (`wicked-estate/CLAUDE.md` Universal Don'ts). estate does **not** implement domain-model logic — that is brain's. estate stores only the `requirement` string + `validated` bool + `community`/`domain_*` KV tags.

### 2.B — brain EQUIPS: the domain-model engine + stores (net-new JS, ports coverage.py + vocabulary.py)

Brain re-implements the two donor engines in JS, reading structure from estate `graph.db` (no parallel graph).

**Coverage engine** (ports `coverage.py`). The provable terminal:

> `coverage = (resolved + risk_flagged) / behavior_bearing_total` — DoD is `coverage == 1.0` (UNACCOUNTED == 0), and the engine **exits non-zero + lists unaccounted SymbolIds when coverage < 1.0** so it doubles as a gate predicate (`coverage.py:11-14, 795-802`).

- **Denominator (behavior-bearing):** kinds `module/function/method/class/struct/interface` + estate behavior kinds `cics_program/step/db2_table`, EXCLUDING structural leaves and any `module` with zero outgoing `calls/uses/references` edges (`coverage.py:59-96, 209-229`). Config-driven via `coverage.behavior_kinds`.
- **Per-node state** (`classify_node`, `coverage.py:389-449`): `resolved` (status=resolved AND confidence ≥ `resolve_threshold`, default **0.75** at `coverage.py:92`, AND in-graph `requirement_validated` agrees) · `risk` (on HITL queue, incl. below-threshold "resolved") · `unaccounted` (bare node — the coverage hole).
- **Output `coverage-report.json`** (fixed shape, `coverage.py:576-588`): `{ total, behavior_bearing, resolved, risk_flagged, unaccounted, coverage, resolved_rate, mean_confidence, resolve_threshold, per_app[], unaccounted_nodes[] }`. Deterministic: sorted by SymbolId, floats to 4 dp.

**Vocabulary engine** (ports `vocabulary.py`). A frequency miner over estate node names — **proposes terms, never coins meaning**. Two orthogonal axes per term (`vocabulary.schema.json:41-77`):
- `status ∈ {proposed, confirmed}` — is the TERM real (schema `:68-72`)
- `verification ∈ {unverified, untrusted_verified, trusted_verified}` — is the MEANING proven against code logic (schema `:73-77`)
- `term_type ∈ {entity, action, abbreviation, domain_concept}` (schema `:49-51`); required fields `[canonical, term_type, status, verification, freq]` (schema `:41`).
- **Project (bind):** confirmed terms write native `domain_entity/domain_action/domain_abbrev = <canonical>` onto their grounding nodes via estate `annotate_kv(..., replace=True)` so estate's own `cluster`/`by-requirement` become term-aware (`vocabulary.py:645-650, 679-771`). **Domain resolution lives in the estate graph, not a brain sidecar.**
- **Reprojection gate predicate** `check_projection` — FAILs when confirmed terms ground on the graph but it carries zero `domain_*` tags (`vocabulary.py:774-821`).

**Domain-model engine** (net-new): builds the `requirements_graph.json` (capability plan, not a code skeleton) by grouping estate communities into business capabilities, keyed to `requirement` annotations. Reads `clusters` + `by-requirement` from estate; writes the requirement strings back via estate `semantics --requirement`.

**brain stores are Read-able-small on purpose:** `vocabulary.json` carries `freq` + `mined_from` but NO per-term where-used index — where-used is estate's job (`vocabulary.py:14-40`). Tier-3 content (rule statement text, source) NEVER duplicated into brain stores.

### 2.C — garden STEERS: extraction skills + modernize/specify archetype

Garden is **skills-only**; it orchestrates brain's engines and estate's graph, and owns the advisory work-shape. It ports the anti-legacy *skills* (not the Python engines — those go to brain):
- `anti-legacy:extraction` → the rule-extraction fork worker (crawl estate graph, read source slice, write `requirement` annotation + confidence).
- `anti-legacy:graph-translator` → the domain-graph fork worker (drives brain's domain-model engine).
- `anti-legacy:negative-extraction`, `anti-legacy:adversarial-review` (advisory, single-artifact critic), `anti-legacy:antagonist` (pre-build threat, PEP §10 step 3).

The **modernize** and **specify** archetypes already exist in garden's catalog (`wicked-garden/.claude/CLAUDE.md:44,51`; source of truth `.claude-plugin/archetypes.json`). This contract pins that garden owns them and that they are **advisory/steering — they clear no gate** (garden's "Steering, not blocking", CLAUDE.md `:102-104`). The gate is crew's.

### 2.D — crew GOVERNS: the WorkflowDef gate state machine (net-new, ports manifest.py)

⚠️ **Honest disjoint-build fact:** crew today has gate/stage machinery (`StageKind = 'recon'|'build'|'review'|'test'` at `wicked-crew/packages/crew/src/core/types.ts:29`; `HumanConfirm = 'none'|'all'|{before:n}` at `:35`; deny-dominant `gateEvaluated` with `floorPass`/`evaluatorPass`/`combined` at `:155,162,165`; evaluator≠creator routing `evaluator_distinct {winner, was}` at `:41`) but **no `WorkflowDef` type exists** (grep across `packages/` is empty). Porting `manifest.py` into a data-driven `WorkflowDef` is net-new crew work.

The state machine crew must reproduce as data (from `manifest.py`):
- **9 gates**, 6 mainline in fixed order: `GATE_1_DESIGN, GATE_2_PLAN, GATE_3_BUILD, GATE_3B_SEMANTIC, GATE_4_UAT, GATE_5_COMPLETENESS` + side/automated `GATE_0_DISCOVERY, GATE_1B_SEMANTIC_JOIN, GATE_3C_DIFFERENTIAL` (`archived/anti-legacy/CLAUDE.md` Gate Approval Cycle).
- **Phase enum + sequence** (`manifest.py:97-119`).
- **Advance preconditions fire on EXIT** of a gate phase (`GATE_PHASE_PRECONDITIONS`, `manifest.py:50-57`; enforced in `cmd_advance` at `:277-291`). Entering a gate phase is always free; leaving requires the bound gate `passed`/`waived`.
- **Generalized kick-back:** recording any gate `failed` rewinds `phase.current` to that gate's producing phase (`GATE_PRODUCING_PHASE`, `manifest.py:70-84`), drops it from `completed`, writes `blocked_reason`, emits a kick-back audit event, and exits code **3** (`cmd_gate` at `:405-456`). `passed`/`waived` never reset.
- **Evidence-gated pass:** a gate records `passed` only with ≥1 registered `--evidence` artifact that content-verifies (exists, checksum undrifted, status not failed/pending); phantom passes hard-fail at the CLI (`cmd_gate` at `:365-386`).
- **GATE_3 = coverage terminal:** GATE_3_BUILD auto-clears on build-integrity `status: PASS` **AND round-trip `rule_coverage ≥ 1.0`** — this is where crew consumes brain's `coverage-report.json` / `wicked.brain.coverage.computed` (`archived/anti-legacy/CLAUDE.md`).
- **GATE_4 = evaluator≠creator:** UAT sign-off requires an independent reviewer; maps onto crew's existing `evaluator_distinct` routing (`types.ts:41`) + `evaluatorPass` (`:162`). Structurally the evaluator cannot be the creating agent.

crew's WorkflowDef is **workflows-as-data**: the phase/gate/precondition/kick-back maps are JSON, not compiled arms (mirrors estate's "rules as DATA" doctrine).

---

## 3. CONTRACT 4(a) — SKILL NAMING (the critical convention)

**Confirmed format.** Frontmatter `name:` is dash-separated `wicked-<product>-<skill>`, kebab-case, ≤64 chars, no colon namespace. Verified against real skills: `name: wicked-brain-graph`, `name: wicked-brain-ingest` (brain `skills/wicked-brain-graph/SKILL.md`, `skills/wicked-brain-ingest/SKILL.md`) and the garden rule (`wicked-garden/.claude/CLAUDE.md:166-171`): domain routers `wicked-garden-{domain}`, fork workers `wicked-garden-{domain}-{role}` (with `context: fork`). The colon form (`wicked-brain:graph`, `wicked-garden:{domain}:{role}`) survives **only** in the SKILL.md body header and optional `subagent_type:` back-compat frontmatter (`wicked-garden/.claude/CLAUDE.md:170`) — never as the `name:`. Pure-bare names are unsafe across Antigravity/Codex/Claude-Code.

**Exact new skill names for the domain work:**

Brain (net-new engine skills, dash-form `wicked-brain-<skill>`):
- `wicked-brain-domain` — domain-model engine: build/refresh `requirements_graph.json` from estate communities + requirement annotations.
- `wicked-brain-vocabulary` — mine → confirm → project glossary (ports `vocabulary.py`); the `domain_*` bind + `check-projection` gate predicate.
- `wicked-brain-coverage` — resolved-or-flagged coverage (ports `coverage.py`); the GATE_3 coverage≥1.0 predicate.

Garden (extraction skills + modernize archetype, dash-form):
- `wicked-garden-modernize` — domain router skill for the modernize archetype (user-invocable).
- `wicked-garden-modernize-extractor` — `context: fork` worker; rule extraction (ports `anti-legacy:extraction`) → writes estate `requirement` annotations.
- `wicked-garden-modernize-translator` — `context: fork` worker; graph-translate → drives `wicked-brain-domain`.
- `wicked-garden-modernize-antagonist` — `context: fork` worker; pre-build threat modeling (ports `anti-legacy:antagonist`).

(`specify` archetype router `wicked-garden-specify` already exists per the archetype catalog; listed here only as the advisory requirements-elicitation entry point.)

---

## 4. CONTRACT 4(b) — EVENT GRAMMAR (4-segment)

**Grammar:** `wicked.<domain>.<noun>.<past-tense-verb>` — exactly four segments, always `wicked.`-prefixed (`wicked-garden/WICKED_GARDEN_BUS_EVENTS.md:9-14`). Domain = producing plugin's short name (`crew` for the shared phase/gate lifecycle, `brain` for brain-owned). **Payload tiers:** Tier 1 (ids+outcomes) always; Tier 2 (small categoricals) when relevant; **Tier 3 (content, source, rule-statement body) NEVER on the bus** — auto-stripped deny-list includes `content`, `body`, `source_code`, `raw_text` (`WICKED_GARDEN_BUS_EVENTS.md:16-42`). All crew events carry `chain_id` in `metadata` (`:126-129`).

**crew domain-model / gate events** (port of `manifest.py` audit trail):
- `wicked.crew.phase.transitioned` — phase approved + advanced (already canonical; `WICKED_GARDEN_BUS_EVENTS.md:49`; donor `anti-legacy:phase-advanced`, `manifest.py:305`).
- `wicked.crew.gate.decided` — gate recorded passed/failed/waived (opinion + evaluator + evidence ids in payload; donor `anti-legacy:gate-signed-off`, `manifest.py:421`).
- `wicked.crew.gate.kicked_back` — failed gate rewound to producing phase (from/to phase + re-run skill; donor `anti-legacy:gate-kicked-back`, `manifest.py:433`).
- `wicked.crew.artifact.registered` — artifact registered with checksum status (donor `anti-legacy:artifact-registered`, `manifest.py:337`).
- `wicked.crew.workflow.completed` — final phase approved (project complete).

**brain domain-model events:**
- `wicked.brain.coverage.computed` — resolved/risk/unaccounted/coverage recomputed; **the signal crew's GATE_3 consumes** (Tier-1 counts + `coverage` float only; no node source).
- `wicked.brain.vocabulary.mined` — bootstrap miner proposed candidate terms (counts by term_type).
- `wicked.brain.vocabulary.projected` — confirmed terms bound onto the estate graph as `domain_*` tags (projected/skipped/unbound counts).
- `wicked.brain.term.confirmed` — a glossary term promoted proposed→confirmed (canonical + term_type).
- `wicked.brain.requirement.annotated` — a business rule written onto a behavior-bearing node (symbol_id + confidence + status; **rule statement body stripped** as Tier-3).
- `wicked.brain.node.riskflagged` — a behavior-bearing node placed on the HITL risk queue (symbol_id + risk_reason category).

Consumption edges (for the disjoint mock contracts): crew GATE_3 subscribes `wicked.brain.coverage.computed`; garden extraction fork workers cause `wicked.brain.requirement.annotated`; brain coverage engine reacts to garden annotation writes.

---

## 5. CONTRACT 4(c) — Versioning, HOME of shared artifacts, and the DoD each workflow must hit

### Shared artifacts — single HOME, single writer

| Artifact | HOME (system of record) | Written by | Read by | Schema version |
|---|---|---|---|---|
| `graph.db` (code graph) | **estate** | estate `index` | brain, garden | estate ≥0.13 |
| `requirement` annotation + `community`/`domain_*` KV | **estate** (native fields) | garden extractor / brain vocabulary-project (via estate CLI) | brain, estate `by-requirement` | estate ≥0.5.1 (replace) |
| `vocabulary.json` + `vocabulary.schema.json` | **brain** | `wicked-brain-vocabulary` | garden, humans | `vocabulary_version "1.0"` |
| `coverage-report.json` | **brain** | `wicked-brain-coverage` | **crew GATE_3** | coverage schema v1 |
| `requirements_graph.json` (domain graph) | **brain** | `wicked-brain-domain` | crew, garden | domain-graph schema v1 |
| `manifest.json` / WorkflowDef state + `audit.jsonl` | **crew** | crew engine only (append-only audit; never edited) | all | WorkflowDef schema v1 |

Rule: **one writer per artifact.** estate owns structure; brain owns the domain-model/vocabulary/coverage stores; crew owns gate state + the tamper-evident audit trail. The traceability spine that no side may break: estate node (native file/line) → its `requirement` annotation → brain's overlay row (keyed `{db_id, symbol_id}`) → `legacy_components` → crew task → `req_id` → UAT verdict.

Versioning: each product keeps independent SemVer (brain 0.18.1, estate v0.13.1, garden v12, crew active). **Contract compatibility is by the pinned schema versions above, not product versions** — a workflow may bump its product version freely as long as the schema versions it emits/consumes stay contract-compatible.

### DoD each per-product workflow must hit (build green + schema conformance)

**estate** — `cargo build --workspace` (0 warnings) + `cargo test --workspace` + `cargo clippy -D warnings` + GraphStore conformance all green (`wicked-estate/CLAUDE.md §9`); `clusters`/`semantics`/`by-requirement` CLI surface stable and covered.

**brain** — `cd server && node --test` green (`wicked-brain/package.json` test script); `wicked-brain-coverage` output validates against coverage-report schema v1 and exits non-zero when coverage<1.0; `wicked-brain-vocabulary` output validates against `vocabulary.schema.json`; **zero `@colbymchenry`/self-built `codegraph.db` references remain** in shipped code (grep/AST-enforced) — structure read only from estate `graph.db`.

**garden** — `/wg-check` structural + skill-review green (`wicked-garden/.claude/CLAUDE.md:21-24`); new skill `name:` frontmatter is dash-form `wicked-garden-modernize[-role]`; `modernize`/`specify` archetypes present in `archetypes.json`; extraction skills are advisory (clear no gate).

**crew** — `npm test` (+ `cargo test` for wicked-core) green; WorkflowDef JSON validates against schema v1; **gate-state parity tests** reproduce `manifest.py` behavior: advance blocks on unmet exit-gate, failed gate kick-back rewinds + exits code 3, passed-gate requires verified evidence, GATE_3 auto-clears only on coverage≥1.0, GATE_4 evaluator≠creator enforced structurally.

Cross-cutting DoD (all four): the produced artifact validates against its HOME schema, and the emitted events conform to the 4-segment grammar with Tier-3 fields stripped. "Done" is re-derived from evidence (the coverage terminal, the verified gate evidence), never asserted — the doctrine shared by anti-legacy's gates, garden's produces-gate, estate's §7, and crew's deny-dominant evaluator.