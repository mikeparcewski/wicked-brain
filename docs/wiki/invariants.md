---
status: published
canonical_for:
  - INV-PATHS-FORWARD
  - INV-ESM-ONLY
  - INV-NO-BUILD-STEP
  - INV-DEPS-MINIMAL
  - INV-MIGRATION-REQUIRED
  - INV-CROSS-PLATFORM
  - INV-CANONICAL-SINGLE-OWNER
  - INV-LINK-DONT-RESTATE
  - INV-MODE-FILE-CANONICAL
  - INV-OVERRIDE-RESPECTED
references: []
owner: core
last_reviewed: 2026-04-17
---

# Invariants

Rules that MUST hold in this codebase. Each has a stable ID. Code, tests, and other wiki pages cite these IDs; they are never restated elsewhere.

A rule with **`Enforced by: (none)`** is aspirational, not a guarantee. Fixing that gap is a legitimate task.

## Purpose

Give every agent — human or AI — a single, citable source for "what MUST be true here." When something is non-obvious or easy to violate, it belongs here.

---

## `INV-PATHS-FORWARD`

All stored paths use forward slashes. Windows inputs normalize with `.replace(/\\/g, '/')` before they enter SQLite or any public API.

- **Applies to:** `server/lib/sqlite-search.mjs#index`, `server/lib/file-watcher.mjs`
- **Enforced by:** `server/test/file-watcher.test.mjs`, `server/test/sqlite-search.test.mjs`

## `INV-ESM-ONLY`

The server is plain ESM JavaScript. No TypeScript, no CommonJS, no transpile step.

- **Applies to:** everything in `server/`
- **Enforced by:** `server/package.json` (`"type": "module"`), `node --test` running directly.

## `INV-NO-BUILD-STEP`

There is no build. `node bin/wicked-brain-server.mjs` must run the server with no prior compile. Tests run via `node --test` with no loader.

- **Applies to:** `server/`
- **Enforced by:** CI runs `npm test` directly; no prebuild step.

## `INV-DEPS-MINIMAL`

Every new runtime dependency requires justification. Prefer Node stdlib. The dependency tree stays shallow so `npm install` remains predictable across platforms.

- **Applies to:** `server/package.json`
- **Enforced by:** (none) — surfaced by PR review. Gap.

## `INV-MIGRATION-REQUIRED`

Any change to SQLite tables (new columns, new tables, renamed fields) MUST include a numbered migration in `sqlite-search.mjs#migrate`. `CREATE TABLE IF NOT EXISTS` does not add columns to existing databases. Existing brains must upgrade seamlessly on server restart.

- **Applies to:** `server/lib/sqlite-search.mjs#migrate`
- **Enforced by:** `server/test/sqlite-search.test.mjs` (migration-from-v0/v1/v2 tests), `server/test/canonical-ingest.test.mjs#schema: migration 4 upgrades a v3 database in place`

## `INV-CROSS-PLATFORM`

All code and skills run on macOS, Linux, and Windows. No Unix-only shell without a Windows fallback. `fs.watch({ recursive: true })` does not work on Linux — the file watcher has a polling fallback.

- **Applies to:** `server/lib/file-watcher.mjs`, all `skills/*/SKILL.md` shell snippets
- **Enforced by:** CI matrix (ubuntu, macos, windows) on tag push. Skill cross-platform notes are enforced at review time.

## `INV-CANONICAL-SINGLE-OWNER`

Exactly one wiki page may declare `canonical_for: <ID>` for any given ID. A second claim is a lint error. Ownership transfers only via explicit `supersedes` in the new owner's frontmatter.

- **Applies to:** `docs/wiki/**/*.md` (and equivalent in downstream projects)
- **Enforced by:** `server/lib/canonical-registry.mjs#buildRegistry` (emits `duplicates`), future lint rule (Phase 5).

## `INV-LINK-DONT-RESTATE`

Wiki pages cite canonical IDs or code locations; they do not restate the content. A page >60 lines with <3 outbound references is presumptively restating and warrants review.

- **Applies to:** `docs/wiki/**/*.md`
- **Enforced by:** (none) — planned as `long_page_low_refs` lint in Phase 5.

## `INV-MODE-FILE-CANONICAL`

`.wicked-brain/mode.json` is the canonical source of truth for repo mode and wiki location. Agents read it first; other pointers (CLAUDE.md, AGENTS.md, convention fallbacks) are secondary.

- **Applies to:** any agent or tool looking up the wiki location
- **Enforced by:** discovery spec; `server/lib/mode-config.mjs#validateMode` guards shape.

## `INV-OVERRIDE-RESPECTED`

A `mode.json` with `override: true` was set by a human. Detection MUST NOT overwrite it without an explicit override-write from the caller.

- **Applies to:** `server/lib/mode-config.mjs#writeModeFile`
- **Enforced by:** `server/test/mode-config.test.mjs#writeModeFile: override:true blocks overwrite by default`

---

## See also

- [`contract-api.md`](contract-api.md) — the `POST /api` contract (canonical for `CONTRACT-API`).
- [`../specs/2026-04-17-wiki-discovery-contract.md`](../specs/2026-04-17-wiki-discovery-contract.md)
- [`../specs/2026-04-17-frontmatter-canonicality.md`](../specs/2026-04-17-frontmatter-canonicality.md)
- [`../../CLAUDE.md`](../../CLAUDE.md) — contributor pointer + historic cross-platform notes.
