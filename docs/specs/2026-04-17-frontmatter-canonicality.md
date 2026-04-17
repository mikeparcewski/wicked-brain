# Frontmatter & Canonicality Contract

**Status:** Draft
**Date:** 2026-04-17
**Owner:** wicked-brain core
**Depends on:** [wiki-discovery-contract](2026-04-17-wiki-discovery-contract.md)

## Purpose

Define the frontmatter schema every wiki page carries, and the canonicality
rules that keep duplication out of the brain's search results. The goal:
when an agent searches for a concept, it gets **one** authoritative hit, not
the same fact quoted in four pages and scored as four independent votes.

## Non-goals

- Not a content style guide. Voice, tone, and terminology belong in
  `style-guide.md` (content-mode) or in per-project conventions.
- Not the search-time collapse implementation. That's Phase 3c. This spec
  only defines the metadata the collapse logic will read.
- Not a general YAML spec. See `server/lib/frontmatter.mjs` for the exact
  supported subset.

## Frontmatter fields

All fields live in a standard YAML frontmatter block (`---` fences) at the
top of the markdown file. wicked-brain's parser supports a strict subset of
YAML — flat keys with string, boolean, number, date, or array values. No
nesting.

### Required

- **`status`** (string) — One of `draft`, `published`, `archived`. Archived
  pages are hidden from default search.
- **`canonical_for`** (array of strings) — IDs this page is the single
  authoritative source for. Other pages MUST reference these IDs rather
  than restate them. Empty array is valid (pointer-only pages).

### Recommended

- **`references`** (array of strings) — What this page depends on. Each
  entry is either a canonical ID (resolved via the registry) or a
  repo-relative path (optionally with `#anchor`). The linter verifies every
  reference resolves.

### Optional / mode-specific

- **`owner`** (string) — Team or role responsible for the page.
- **`last_reviewed`** (YYYY-MM-DD) — When the page was last verified against
  reality. Content-mode lint warns when this is older than N months.
- **`supersedes`** (string) — Path to a page this one replaces. Enables the
  deprecation chain.
- **`locale`** (string) — BCP-47 locale code for translations (`en`, `ja`,
  `es-MX`). Content-mode only.
- **`version`** (string or number) — Version of the underlying system this
  page documents. Content-mode only.

## Canonicality rules

1. **One page per ID.** If two pages both declare `canonical_for: INV-X`,
   the registry build fails (not a warning — a fail). Humans resolve by
   picking the canonical page and changing the other to reference.
2. **Link, don't restate.** Non-canonical pages cite IDs from the registry
   rather than repeating the underlying content. The linter flags long
   pages (>60 lines) with few outbound references as suspicious.
3. **Stable IDs.** Canonical IDs are ALL-CAPS kebab-case with a category
   prefix: `INV-`, `CONTRACT-`, `RECIPE-`, `TERM-`. Once published, an ID
   is permanent. Renaming breaks every reference — don't.
4. **Broken references are errors.** A reference to an ID with no canonical
   page, or a path that doesn't exist, fails the lint.
5. **Archived pages keep their IDs reserved.** An ID owned by an archived
   page is not available for re-assignment. Superseding via `supersedes`
   explicitly transfers ownership.

## Reference syntax

A `references` entry takes one of these forms:

| Form                     | Example                                | Resolves to |
|--------------------------|----------------------------------------|-------------|
| Canonical ID             | `INV-PATHS-FORWARD`                    | The page owning that ID. |
| Repo-relative path       | `server/lib/sqlite-search.mjs`         | File must exist. |
| Path with line           | `server/lib/sqlite-search.mjs:42`      | File must exist; line not verified. |
| Path with symbol         | `server/lib/sqlite-search.mjs#index`   | File must exist; symbol not verified. |
| Path with anchor         | `CLAUDE.md#cross-platform`             | File must exist; anchor not verified. |
| External URL             | `https://...`                          | Skipped by the linter. |

Symbol/line/anchor verification is deferred — wicked-brain has LSP; a
future phase can drive anchor verification via the language server.

## Canonical-for categories

Categories live on the ID prefix. Conventions:

- **`INV-`** — Invariants. Rules of the system that MUST hold. Owner:
  `wiki/invariants.md` in code-mode projects.
- **`CONTRACT-`** — Machine-checkable contracts (API shapes, schema). Owner:
  a specific `contract-*.md` page. Generated pages claim these.
- **`RECIPE-`** — Extension recipes. Owner: an `extend-*.md` page.
- **`TERM-`** — Glossary terms. Owner: `wiki/glossary.md` in content-mode.
- **`POLICY-`** — Editorial / operational policies. Owner varies.
- **Project-specific prefixes** — Allowed with a registered category in
  `wiki/README.md`.

## Example pages

### Invariants page (canonical)

```markdown
---
status: published
canonical_for: [INV-PATHS-FORWARD, INV-ESM-ONLY, INV-MIGRATION-REQUIRED]
references: []
owner: core
---

## INV-PATHS-FORWARD

All stored paths use forward slashes.

**Enforced by:** `server/test/sqlite-search.test.mjs`
**Applies to:** `sqlite-search.mjs#index`, `file-watcher.mjs`
```

### Extension recipe (references)

```markdown
---
status: published
canonical_for: [RECIPE-ADD-ACTION]
references:
  - INV-ESM-ONLY
  - server/lib/sqlite-search.mjs
  - CLAUDE.md#server-javascript
---

## Add a new `POST /api` action

...
```

### Pointer-only page (no canonical_for)

```markdown
---
status: published
canonical_for: []
references:
  - INV-PATHS-FORWARD
  - wiki/invariants.md
---

Points at the invariants page; adds no new content.
```

## Implementation

- **Parser:** `server/lib/frontmatter.mjs` — `extractFrontmatter`,
  `parseFrontmatter`, `parseFrontmatterBlock`, `getField`,
  `serializeFrontmatterBlock`.
- **Registry:** `server/lib/canonical-registry.mjs` — `buildRegistry`,
  `findBrokenReferences`, `loadWikiEntries`.
- **Lint (Phase 5):** exposed via `wicked-brain:lint` with rules
  `duplicate_canonical_for`, `broken_reference`, `long_page_low_refs`.
- **Search collapse (Phase 3c):** results sharing a `canonical_for` ID
  return one hit with `also_found_in`.

## Open questions

- Should pointer-only pages (empty `canonical_for`) be indexed at all? They
  add no content but improve discoverability. Leaning index-but-deprioritize.
- What happens when the LSP comes online and symbol anchors become
  verifiable — is anchor verification opt-in per project or always-on?
  Leaning opt-in via lint config.
