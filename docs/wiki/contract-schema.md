---
status: published
canonical_for: [CONTRACT-SCHEMA]
references: [INV-MIGRATION-REQUIRED]
owner: core
last_reviewed: 2026-04-17
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

## Migration ladder

| Version | Summary | Operations |
|---|---|---|
| 1 | add rel column to links table + access_log table | `ADD COLUMN links.rel`, `CREATE TABLE access_log`, `CREATE INDEX idx_access_doc ON access_log`, `CREATE INDEX idx_access_session ON access_log` |
| 2 | add confidence + evidence_count to links, add search_misses table | `ADD COLUMN links.confidence`, `ADD COLUMN links.evidence_count`, `CREATE TABLE search_misses` |
| 3 | add content_hash column + index for memory dedup | `ADD COLUMN documents.content_hash`, `CREATE INDEX idx_documents_content_hash ON documents` |
| 4 | add canonical_for + refs columns, canonical_ownership table | `ADD COLUMN documents.canonical_for`, `ADD COLUMN documents.refs`, `CREATE TABLE canonical_ownership`, `CREATE INDEX idx_canonical_doc ON canonical_ownership` |
| 5 | add translation_of + version_of columns for locale/version | `ADD COLUMN documents.translation_of`, `ADD COLUMN documents.version_of` |

Current head: **v5**.

