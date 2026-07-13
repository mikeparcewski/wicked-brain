---
status: published
canonical_for: [CONTRACT-SCHEMA]
references: [INV-MIGRATION-REQUIRED]
owner: core
last_reviewed: 2026-07-13
generated: true
source: server/lib/sqlite-search.mjs
---

# Contract: SQLite schema

Generated from `server/lib/sqlite-search.mjs`. Do not hand-edit — regenerate with `npm run gen:wiki`. Changes to the schema require a numbered migration per `INV-MIGRATION-REQUIRED`.

## Tables

### `documents`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` |  |
| `path` | `TEXT NOT NULL` |  |
| `content` | `TEXT NOT NULL` |  |
| `frontmatter` | `TEXT` |  |
| `brain_id` | `TEXT NOT NULL` |  |
| `indexed_at` | `INTEGER NOT NULL` |  |
| `content_hash` | `TEXT` |  |
| `canonical_for` | `TEXT` |  |
| `refs` | `TEXT` |  |
| `translation_of` | `TEXT` |  |
| `version_of` | `TEXT` |  |
| `last_verified_at` | `INTEGER` |  |

### `canonical_ownership`

| Column | Type | Notes |
|---|---|---|
| `canonical_id` | `TEXT PRIMARY KEY` |  |
| `doc_id` | `TEXT NOT NULL` |  |
| `path` | `TEXT NOT NULL` |  |
| `brain_id` | `TEXT NOT NULL` |  |

### `links`

| Column | Type | Notes |
|---|---|---|
| `source_id` | `TEXT NOT NULL` |  |
| `source_brain` | `TEXT NOT NULL` |  |
| `target_path` | `TEXT NOT NULL` |  |
| `target_brain` | `TEXT` |  |
| `rel` | `TEXT` |  |
| `link_text` | `TEXT` |  |
| `confidence` | `REAL DEFAULT 0` | .5 |
| `evidence_count` | `INTEGER DEFAULT 0` |  |

### `access_log`

| Column | Type | Notes |
|---|---|---|
| `doc_id` | `TEXT NOT NULL` |  |
| `session_id` | `TEXT NOT NULL` |  |
| `accessed_at` | `INTEGER NOT NULL` |  |

### `search_misses`

| Column | Type | Notes |
|---|---|---|
| `query` | `TEXT NOT NULL` |  |
| `searched_at` | `INTEGER NOT NULL` |  |
| `session_id` | `TEXT` |  |

### `domain_models`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` |  |
| `project_id` | `TEXT NOT NULL` |  |
| `brain_id` | `TEXT NOT NULL` |  |
| `schema_version` | `TEXT NOT NULL` |  |
| `migration_mode` | `TEXT NOT NULL` |  |
| `source` | `TEXT` |  |
| `created_at` | `INTEGER NOT NULL` |  |

### `domains`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` |  |
| `model_id` | `TEXT NOT NULL` |  |
| `domain_key` | `TEXT NOT NULL` |  |
| `description` | `TEXT` |  |
| `cluster_id` | `INTEGER` |  |

### `requirements`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` |  |
| `domain_id` | `TEXT NOT NULL` |  |
| `req_key` | `TEXT NOT NULL` |  |
| `title` | `TEXT NOT NULL` |  |
| `description` | `TEXT NOT NULL` |  |
| `status` | `TEXT` |  |
| `disposition` | `TEXT` |  |
| `disposition_reason` | `TEXT` |  |

### `requirement_components`

| Column | Type | Notes |
|---|---|---|
| `requirement_id` | `TEXT NOT NULL` |  |
| `kind` | `TEXT NOT NULL` |  |
| `value` | `TEXT NOT NULL` |  |

### `rules`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` |  |
| `requirement_id` | `TEXT NOT NULL` |  |
| `rule_kind` | `TEXT NOT NULL` |  |
| `rule_id` | `TEXT NOT NULL` |  |
| `statement` | `TEXT NOT NULL` |  |
| `confidence` | `REAL` |  |
| `field` | `TEXT` |  |
| `error_ref` | `TEXT` |  |
| `code` | `TEXT` |  |
| `source_ref` | `TEXT` |  |

### `rule_provenance`

| Column | Type | Notes |
|---|---|---|
| `rule_id` | `TEXT PRIMARY KEY` |  |
| `source` | `TEXT NOT NULL` |  |
| `ref` | `TEXT NOT NULL` |  |
| `source_kinds` | `TEXT NOT NULL` |  |

### `rule_symbol_refs`

| Column | Type | Notes |
|---|---|---|
| `rule_id` | `TEXT NOT NULL` |  |
| `db_id` | `TEXT NOT NULL` |  |
| `symbol_id` | `TEXT NOT NULL` |  |
| `validated` | `INTEGER DEFAULT 0` |  |
| `cluster_id` | `INTEGER` |  |

### `entities`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` |  |
| `domain_id` | `TEXT NOT NULL` |  |
| `entity_key` | `TEXT NOT NULL` |  |
| `description` | `TEXT` |  |

### `entity_fields`

| Column | Type | Notes |
|---|---|---|
| `entity_id` | `TEXT NOT NULL` |  |
| `name` | `TEXT NOT NULL` |  |
| `type` | `TEXT NOT NULL` |  |
| `description` | `TEXT` |  |

### `vocabulary_terms`

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` |  |
| `model_id` | `TEXT NOT NULL` |  |
| `canonical` | `TEXT NOT NULL` |  |
| `term_type` | `TEXT NOT NULL` |  |
| `definition` | `TEXT` |  |
| `status` | `TEXT NOT NULL` |  |
| `verification` | `TEXT NOT NULL` |  |
| `freq` | `INTEGER NOT NULL` |  |
| `mined_from` | `TEXT` |  |

### `term_sources`

| Column | Type | Notes |
|---|---|---|
| `term_id` | `TEXT NOT NULL` |  |
| `kind` | `TEXT NOT NULL` |  |
| `ref` | `TEXT NOT NULL` |  |
| `node_kind` | `TEXT` |  |
| `file` | `TEXT` |  |
| `freq` | `INTEGER` |  |

### `coverage_ledger`

| Column | Type | Notes |
|---|---|---|
| `model_id` | `TEXT NOT NULL` |  |
| `symbol_id` | `TEXT NOT NULL` |  |
| `resolved` | `INTEGER NOT NULL` |  |
| `rule_id` | `TEXT` |  |
| `risk_reason` | `TEXT` |  |

## Migration ladder

| Version | Summary | Operations |
|---|---|---|
| 1 | add rel column to links table + access_log table | `ADD COLUMN links.rel`, `CREATE TABLE access_log`, `CREATE INDEX idx_access_doc ON access_log`, `CREATE INDEX idx_access_session ON access_log` |
| 2 | add confidence + evidence_count to links, add search_misses table | `ADD COLUMN links.confidence`, `ADD COLUMN links.evidence_count`, `CREATE TABLE search_misses` |
| 3 | add content_hash column + index for memory dedup | `ADD COLUMN documents.content_hash`, `CREATE INDEX idx_documents_content_hash ON documents` |
| 4 | add canonical_for + refs columns, canonical_ownership table | `ADD COLUMN documents.canonical_for`, `ADD COLUMN documents.refs`, `CREATE TABLE canonical_ownership`, `CREATE INDEX idx_canonical_doc ON canonical_ownership` |
| 5 | add translation_of + version_of columns for locale/version | `ADD COLUMN documents.translation_of`, `ADD COLUMN documents.version_of` |
| 6 | add last_verified_at for wiki staleness detection | `ADD COLUMN documents.last_verified_at` |
| 7 | domain-model / vocabulary / coverage relational store. | `CREATE TABLE domain_models`, `CREATE TABLE domains`, `CREATE TABLE requirements`, `CREATE TABLE requirement_components`, `CREATE TABLE rules`, `CREATE TABLE rule_provenance`, `CREATE TABLE rule_symbol_refs`, `CREATE TABLE entities`, `CREATE TABLE entity_fields`, `CREATE TABLE vocabulary_terms`, `CREATE TABLE term_sources`, `CREATE TABLE coverage_ledger`, `CREATE INDEX idx_domains_model ON domains`, `CREATE INDEX idx_requirements_domain ON requirements`, `CREATE INDEX idx_reqcomp_req ON requirement_components`, `CREATE INDEX idx_rules_req ON rules`, `CREATE INDEX idx_rulesym_symbol ON rule_symbol_refs`, `CREATE INDEX idx_entities_domain ON entities`, `CREATE INDEX idx_entfields_entity ON entity_fields`, `CREATE INDEX idx_vocab_model ON vocabulary_terms`, `CREATE INDEX idx_coverage_model ON coverage_ledger` |

Current head: **v7**.

