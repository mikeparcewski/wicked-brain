---
status: published
canonical_for: [RECIPE-RUN-TESTS]
references:
  - INV-ESM-ONLY
  - INV-NO-BUILD-STEP
  - INV-CROSS-PLATFORM
owner: core
last_reviewed: 2026-04-17
---

# Operate: running the tests

## Purpose

Run the server test suite locally the same way CI does. There is no
framework to install and no build — `node --test` is the entry point and
the authority.

## Commands

Run from `server/`:

```bash
npm test                           # full suite
node --test test/<file>.test.mjs   # a single file
node --test test/<file>.test.mjs --test-name-pattern "pattern"   # filter by name
```

CI runs `npm test` on ubuntu, macos, and windows. The suite must pass on
all three — `INV-CROSS-PLATFORM`.

## What the tests cover

- **SQLite + FTS5** — indexing, search, rank, collapse, migrations.
  `sqlite-search.test.mjs`, `canonical-ingest.test.mjs`,
  `search-collapse.test.mjs`, `locale-version-collapse.test.mjs`.
- **Wikilinks** — parsing conventions. `wikilinks.test.mjs`.
- **File watcher** — platform-specific polling fallback.
  `file-watcher.test.mjs`.
- **LSP layer** — protocol, client, manager, servers, integration.
  `lsp-*.test.mjs`.
- **Mode detection + canonicality** — the wiki-building stack.
  `detect-mode.test.mjs`, `mode-config.test.mjs`, `frontmatter.test.mjs`,
  `canonical-registry.test.mjs`.
- **Generators** — `gen-contract-api.test.mjs`, `gen-contract-schema.test.mjs`,
  `gen-file-map.test.mjs`.
- **Dog-food** — validates wicked-brain's own wiki under the registry.
  `wiki-dogfood.test.mjs`.

## Gotchas

- The tests use `:memory:` SQLite instances. They do not leave artifacts on
  disk except where a test explicitly creates a tmp file (migration tests).
- `fs.watch({ recursive: true })` does not work on Linux — the watcher test
  has a polling fallback. If a watcher test fails locally on macOS but
  passes on Linux CI (or vice versa), you are almost certainly looking at
  the recursive-vs-polling split.
- Tests never touch the network and must stay offline.
- New dependencies are discouraged — see `INV-DEPS-MINIMAL`. Most test
  helpers belong in `node:test` + `node:assert/strict` already.

## See also

- [`invariants.md`](invariants.md) — `INV-CROSS-PLATFORM`, `INV-ESM-ONLY`.
- [`operate-release.md`](operate-release.md) — how tag-triggered CI runs
  this suite before publishing.
