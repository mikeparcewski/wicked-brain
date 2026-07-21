---
name: REQ-005-dod-criteria
title: "wicked-brain — Definition of Done"
status: evidence-verified
version: 0.2
date: 2026-07-21
author: michael.parcewski@accenture.com
review-required: true
---

# REQ-005 — Definition of Done

## Scope

This DoD applies to wicked-brain v0.18.1 as a published, bridge-period npm product. It covers the server, skill surface, test coverage, and cross-platform requirements. Items that are architecturally out of scope for the bridge period (domain modeling, code graph, conformance) are not listed here — their retirement is recorded in `RET-BRAIN-DOMAIN-001-retirement.md`.

---

## Checklist

### Publishing

- [x] Published to npm as `wicked-brain@0.18.1` (skills + installer)
- [x] Published to npm as `wicked-brain-server` at matching version
- [x] GitHub release created with auto-generated notes (CI pipeline `release.yml`)
- [x] npm provenance attestation present (pipeline publishes with `--provenance`)

### Quality

- [x] All tests pass: zero failures (`cd server && node --test`; count grows as coverage is added)
- [x] No test framework dependencies — uses `node:test` stdlib only
- [x] Schema migrations in `sqlite-search.mjs` are numbered and cumulative (migrations 1–6; 7+8 retired)
- [x] `gen-contract-schema` migration-count test updated to `[1..6]` after domain store retirement
- [ ] Adversarial review of current skill surface: no open CRITs

### Skills

- [x] 27 skills installed and documented (SKILL.md per skill directory)
- [x] All skill frontmatter `name:` fields use dash prefix (`wicked-brain-{operation}`) — no colon form
- [x] `install.mjs` detects Claude Code, Gemini CLI, Copilot CLI, Cursor, Codex, Kiro, Antigravity
- [ ] Each skill includes a "Cross-Platform Notes" section — `wicked-brain-query` and `wicked-brain-read` currently omit it (they make no platform-specific calls; see DES-001 §Skill anatomy for the policy)
- [x] Retired skills removed: `wicked-brain-domain`, `wicked-brain-coverage`, `wicked-brain-vocabulary` (deleted in RET-BRAIN-DOMAIN-001 follow-up)

### Architecture hygiene

- [x] Domain/conformance JS stores retired (`RET-BRAIN-DOMAIN-001-retirement.md`): 12 modules + 12 test files + migrations 7+8 removed
- [x] No duplicate domain/knowledge implementation — domain model lives in estate graph (per `DES-DOMAIN-BRAIN-CONTRACT.md`)
- [x] Dead codegraph modules (`codegraph-*.mjs`) removed; brain no longer opens its own nodes/edges SQLite
- [x] README updated: removed stale "domain-model / vocabulary / coverage engines" references

### Cross-platform

- [x] CI matrix runs on ubuntu, macos, and windows (GitHub Actions `release.yml`)
- [x] File watcher has polling fallback for Linux (no `fs.watch` recursive on Linux)
- [x] All paths normalized with `.replace(/\\/g, '/')` for Windows compatibility
- [x] Skills use agent-native tools (Read, Write, Grep, Glob) over shell commands where possible; `curl` used for API calls (cross-platform on Windows 10+)

### Bridge-period contract

- [x] Bridge-period scope documented: brain owns session memory, chunks, wiki, wikilinks; does not own code graph or domain model
- [x] Estate integration seam present: skills note estate preference when estate MCP is available
- [ ] Bridge-period migration path documented: clear, published path from brain memory/knowledge to estate for users migrating when estate v1.0 ships

---

## Evidence references

| Artifact | Location |
|---|---|
| Retirement record | `.product/RET-BRAIN-DOMAIN-001-retirement.md` |
| Domain-brain contract | `.product/DES-DOMAIN-BRAIN-CONTRACT.md` |
| CI pipeline | `.github/workflows/release.yml` |
| Test suite | `server/test/` |
| Skill surface | `skills/wicked-brain-*/SKILL.md` |
| Installer | `install.mjs` |
