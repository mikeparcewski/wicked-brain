---
name: RAID
title: "wicked-brain — Risks, Assumptions, Issues, Decisions"
status: draft
version: 0.1
date: 2026-07-21
author: michael.parcewski@accenture.com
review-required: true
---

# RAID — wicked-brain

Risks, Assumptions, Issues, Decisions for the wicked-brain product (v0.18.1, bridge period).

---

## Risks

### RISK-001 Bridge-period obsolescence
**Status:** Active | **Severity:** Medium | **Likelihood:** Certain (by design)

wicked-brain's memory and knowledge role is architecturally destined to fold into wicked-estate once that MCP server reaches v1.0 maturity. Users who install and depend on wicked-brain skills will need to migrate their workflows to estate-native tools. Skills themselves may be retargeted rather than deleted, but the underlying store (SQLite on disk) will not be the long-term home for graph-backed knowledge.

**Mitigation:** Document the bridge-period migration path (see DES-001 § Bridge-Period Seam). Keep the estate integration seam explicit in skills (skills should prefer estate when present). Publish a migration guide before bridge-period ends.

---

### RISK-002 Cross-platform file watching — Linux recursive limitation
**Status:** Active | **Severity:** Low | **Likelihood:** Certain (platform constraint)

`fs.watch({ recursive: true })` is not supported on Linux. The file-watcher module (`server/lib/file-watcher.mjs`) implements a polling fallback, but polling introduces latency and higher CPU usage under heavy file activity.

**Mitigation:** Polling fallback is already implemented. Document the behavior difference in cross-platform notes. Monitor Node.js upstream for native Linux recursive support.

---

### RISK-003 LSP optional dependency — graceful degradation required
**Status:** Active | **Severity:** Low | **Likelihood:** Common

The LSP client layer (`server/lib/lsp-client.mjs`) is optional — if no LSP server is available for the project language, the layer must degrade gracefully without breaking search or indexing. Any change to the LSP integration risks introducing hard failures where soft degradation is expected.

**Mitigation:** LSP client uses hand-rolled JSON-RPC with zero new runtime dependencies. All LSP code paths must be guarded. Tests must cover the no-LSP degradation path.

---

## Assumptions

### ASSM-001 Node.js >= 20 required
Users have Node.js 20 or later installed. `node:test` (stdlib test runner) and `fs.watch` with the options used require Node.js 18+; v20 is the LTS baseline assumed for all skill invocations and server startup.

### ASSM-002 Bridge period remains stable until estate v1.0 absorbs it
wicked-brain continues as the canonical bridge-period memory/knowledge tool until wicked-estate v1.0 ships the full memory and knowledge surface via MCP. No premature deprecation. The bridge-period window is open-ended — brain keeps receiving fixes and skill updates until the successor is verified ready.

---

## Issues

No open issues at time of writing. See GitHub issues for the live list.

---

## Decisions

### DEC-001 Plain JavaScript (no TypeScript)
**Date:** Pre-v0.1 | **Status:** Final

The server and installer are written in plain ESM JavaScript with no build step. TypeScript was evaluated (see `archive/v1/` — the v1 TypeScript implementation) and retired. Rationale: eliminates the build toolchain, keeps the dependency surface shallow, removes the compile step from the release pipeline, and makes the server directly inspectable without source maps. The tradeoff (no static types) is acceptable given the small module count and the stdlib-only test runner.

### DEC-002 SQLite FTS5 for full-text search
**Date:** Pre-v0.1 | **Status:** Final

SQLite with the FTS5 extension is the storage engine for indexed content, memories, wiki articles, and the access log. Rationale: local-first with zero infrastructure (no server to run, no network dependency), ACID/WAL for crash safety, FTS5 for ranked full-text search, and `better-sqlite3` for synchronous Node.js bindings that keep the server code simple. The tradeoff (no multi-user concurrent write) is acceptable: each project brain is a single-user, single-process store.

### DEC-003 Skill frontmatter `name:` uses dash prefix (not colon)
**Date:** Post-v0.10 | **Status:** Final

Skill SKILL.md frontmatter uses `name: wicked-brain-search` (dash separator), not `name: wicked-brain:search` (colon). Rationale: non-Claude CLIs (Gemini CLI, Copilot CLI, Cursor, Codex, Antigravity) rewrite colons to dashes when resolving skill directory names, producing a name/directory mismatch that silently drops the skill. The dash form is the only cross-CLI-compatible option. All 27 skills follow this convention.
