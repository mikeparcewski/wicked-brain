# Wiki Staleness Detection

**Status:** Draft
**Date:** 2026-04-17
**Owner:** wicked-brain core
**Tracks:** [#38](https://github.com/mikeparcewski/wicked-brain/issues/38)

## Purpose

Detect wiki articles whose synthesized claims are no longer grounded in their
source chunks. Agents consuming the wiki must be able to distinguish
articles that are current from articles that are stale, so downstream
decisions (e.g. "add a method to `CrewService`") are not made against
obsolete structural claims.

## Non-goals

- **Auto-regeneration.** This spec detects staleness; `wicked-brain:compile`
  is what re-synthesizes. Auto-triggering compile on stale articles is a
  follow-up.
- **Source-file tracking.** Wiki articles record the chunks they synthesized
  from, not the raw source files those chunks came from. Walking back to
  the source-file layer (so a `server/lib/*.mjs` edit invalidates a wiki
  article without touching a chunk) is a follow-up.
- **Confidence decay.** Score-based decay as a function of time or commit
  count is out of scope — it is inferable from the staleness signal and
  not yet validated against real usage.
- **Narrative vs. factual split.** Separating "CrewService is 4100 LOC" from
  "CrewService orchestrates workflows" would require NL-level claim
  extraction. Deferred.

## Contract

### Article frontmatter

Wiki articles carry two parallel arrays in their frontmatter. This shape
is what `wicked-brain:compile` already specifies
([`compile/SKILL.md:158-177`](../../skills/wicked-brain-compile/SKILL.md)),
and it is the minimum the frontmatter parser can represent without a
schema extension (nested objects are unsupported — see
[`extend-migration.md`](../wiki/extend-migration.md) and the parser notes
in [`server/lib/frontmatter.mjs`](../../server/lib/frontmatter.mjs)).

```yaml
source_chunks:
  - chunks/extracted/a.md
  - chunks/extracted/b.md
source_hashes:
  - chunks/extracted/a.md: 8f3c1a04
  - chunks/extracted/b.md: 2b90e7d1
```

Each `source_hashes` entry is a string of the form `"{path}: {hash}"`. The
hash is the first 8 characters of the SHA-256 of the source chunk's body
(frontmatter stripped). This matches the hashing convention the compile
skill already documents.

An article with `source_chunks` but no `source_hashes` is treated as
**unverifiable** (legacy). Detection reports it but does not call it stale.

### The `verify_wiki` action

New `POST /api` action — see [`extend-action.md`](../wiki/extend-action.md).

```
action: verify_wiki
params: { path?: string }   // when omitted, scans every wiki/* article
```

Response:

```ts
{
  articles: Array<{
    path: string,
    status: "fresh" | "stale" | "orphaned" | "unverifiable",
    source_count: number,
    matched: number,       // count of chunks whose current hash matches the recorded one
    mismatched: string[],  // chunk paths whose content hash has drifted
    missing: string[],     // chunk paths that no longer exist in the index
    last_verified_at: number | null,
  }>,
  summary: {
    total: number,
    fresh: number,
    stale: number,
    orphaned: number,
    unverifiable: number,
  },
}
```

Status rules:

- `fresh` — every recorded `source_hashes` entry matches the current chunk's
  body hash. `missing` is empty. `mismatched` is empty.
- `stale` — at least one `mismatched` entry.
- `orphaned` — every recorded chunk is `missing` from the index.
- `unverifiable` — no `source_hashes` field (legacy article).

Mixed case (some missing + some matched) is `stale`. Missing chunks are
surfaced in `missing` so the caller can decide whether to re-compile or
prune.

The action is read-only (not in `WRITE_ACTIONS`). Every invocation persists
`last_verified_at` on each article's document row.

### Schema (Migration 6)

Add `last_verified_at INTEGER` to `documents`. Nullable — null means never
verified. Indexed only if profiling shows it matters; initial scan is
whole-table.

## Detection algorithm

For each `wiki/*` document:

1. Parse frontmatter via `parseFrontmatterBlock`. Read `source_hashes`.
   - If absent → `unverifiable`.
2. For each entry `"{chunk_path}: {hash}"`:
   - Look up the chunk by path. Not found → add to `missing`.
   - Compute first-8-char SHA-256 of the chunk body (strip frontmatter with
     `extractFrontmatter`). Compare to recorded hash.
   - Mismatch → add to `mismatched`.
3. Classify per the status rules above.
4. `UPDATE documents SET last_verified_at = <now> WHERE id = ?`.

## Surface

`wicked-brain:status` depth 1 already reserves a "staleness warnings" line
([`skills/wicked-brain-status/SKILL.md:86`](../../skills/wicked-brain-status/SKILL.md)).
That line is filled by calling `verify_wiki` with no params and reporting
`{summary.stale} stale, {summary.orphaned} orphaned, {summary.unverifiable} unverifiable`.

The status skill should not fail when a brain has no wiki articles — a
zero-article result returns an empty `articles` list and all-zero summary.

## Invariants

- **INV-VERIFY-IDEMPOTENT.** Two calls in a row return the same status
  (ignoring `last_verified_at`). Enforced by the algorithm being pure over
  the current DB state.
- **INV-VERIFY-READ-ONLY.** `verify_wiki` does not mutate article content,
  chunks, or the FTS index. Only the `last_verified_at` column changes.
- **INV-MIGRATION-REQUIRED.** The `last_verified_at` column lands via
  Migration 6. Pre-migration databases read it as `NULL`.

## Testing

Per [`operate-testing.md`](../wiki/operate-testing.md) — `node:test` only,
no new deps.

- **Migration upgrade test.** Build a v5 DB with `better-sqlite3` directly,
  open via `SqliteSearch`, assert `documents.last_verified_at` exists,
  assert existing rows read it as `NULL`.
- **Happy path.** Ingest a chunk. Ingest a wiki article whose
  `source_hashes` records the chunk's current body hash. Call
  `verify_wiki` — status `fresh`, `last_verified_at` set.
- **Stale.** Re-ingest the chunk with different body, re-run verify —
  status `stale`, mismatched path listed.
- **Orphaned.** Ingest wiki only, no chunk — status `orphaned`.
- **Unverifiable.** Wiki article with `source_chunks` but no
  `source_hashes` — status `unverifiable`.
- **Scoped call.** `verify_wiki` with explicit `path` returns a
  single-article result.

## Open questions

- Should `verify_wiki` emit a `wicked.wiki.verified` bus event? Leaning
  yes, fire-once-per-scan (not per-article) to avoid flooding the bus on
  a 200-article brain. Deferred until the bus naming pattern review.
- Should `missing` distinguish "chunk was never ingested" from "chunk was
  ingested then removed"? The brain has no deletion-tracking for chunks
  today, so we cannot. Noted for a follow-up if access_log gains the
  signal.
