---
name: TEST-001-test-strategy
title: "wicked-brain — Test Strategy"
status: draft
version: 0.1
date: 2026-07-21
author: michael.parcewski@accenture.com
review-required: true
---

# TEST-001 — Test Strategy

## Overview

wicked-brain's test strategy has four defined layers: unit/integration tests for the server, a skill smoke test for the skill surface, a cross-platform CI matrix, and a wicked-testing acceptance gate. A fifth layer (manual testing) is described in the coverage-gaps section. The test runner for automated tests is `node:test` (Node.js stdlib) — no test framework dependencies.

---

## Layer 1 — Unit and integration tests (server)

**Location:** `server/test/`

**Runner:** `node --test` (Node.js stdlib `node:test`)

**Current count:** zero failures (count grows as coverage is added; do not treat a specific number as a DoD gate)

**How to run:**
```
cd server && node --test
```

### What the tests cover

| Area | What is tested |
|---|---|
| `sqlite-search` | FTS5 indexing, ranked search, schema migrations (1–6), table creation, chunk CRUD |
| FTS5 search ranking | Result ordering, BM25 scoring, multi-term queries, prefix matching |
| Wikilinks | Forward link extraction, backlink resolution, links table population, orphan detection |
| File watcher | Auto-reindex on file change, polling fallback path (Linux), debounce behavior |
| LSP client | Hand-rolled JSON-RPC framing, request/response matching, no-LSP degradation path |
| Memory promoter | Memory creation, promotion, contradiction detection, recent_memories ordering |
| Frontmatter parsing | YAML frontmatter extraction, field normalization, malformed frontmatter handling |
| Backlinks | Backlink graph construction, `backlinks` and `forward_links` action responses |
| Action dispatch | All documented `POST /api` actions: correct response shape, error handling for unknown actions |
| Tag frequency | Tag extraction, frequency ranking, `tag_frequency` response |
| Search misses | Miss logging, `search_misses` response, threshold-based surfacing |
| Access log | `access_log` recording, `recent_memories` ordering, candidate surfacing |
| Link health | `link_health` action, broken link detection, `confirm_link` resolution |
| Contradictions | `contradictions` action, contradiction pair detection |

### What the tests do not cover

- **LLM output quality** — Skills invoke the model; the model's answer quality is not testable at the server layer.
- **Production deployment** — No load, HA, or multi-instance scenarios. The server is single-process, local-first.
- **Multi-user concurrent write access** — SQLite single-writer constraint is accepted; concurrent access is not a use case.
- **Skill behavior end-to-end** — Skill tests (Layer 2) cover install and frontmatter; full agent-invocation flows are not automated.

---

## Layer 2 — Skill smoke test

**Purpose:** Verify that the installer runs without error and that every installed SKILL.md has valid, self-consistent frontmatter.

**How to run (redirect to a temp directory — install.mjs has no `--dry-run` flag):**
```
node install.mjs --path ./temp-test-dir
```

**What is checked:**
- `install.mjs` exits 0 on a clean system with at least one detected CLI
- Every `skills/wicked-brain-*/SKILL.md` has a `name:` field in frontmatter
- The `name:` value matches the directory name (e.g., `name: wicked-brain-search` in `skills/wicked-brain-search/SKILL.md`)
- No skill references a deleted module (post-retirement: no reference to `domain-model.mjs`, `domain-store.mjs`, `coverage.mjs`, `vocabulary.mjs`, `domain-config.mjs`)

**Current skill count:** 27 skills

---

## Layer 3 — Cross-platform CI

**Location:** `.github/workflows/release.yml` (delegates to `mikeparcewski/wicked-ci` reusable workflow `node-release.yml`; the OS/Node matrix is defined there, not inline in this repo)

**Trigger:** `v*` tags (release pipeline)

**Matrix:** ubuntu-latest · macos-latest · windows-latest (see reusable workflow for Node version; `ci.yml` uses `lts/*`)

**Purpose:** Catch platform-specific failures in `better-sqlite3` native bindings, `fs.watch` behavior differences, and path separator handling. All server tests must pass (`cd server && node --test` exits 0) on all three platforms before release.

**npm publish:** The pipeline also runs `npm publish --provenance` after tests pass. The package version is set from the git tag; `package.json` is not manually versioned.

---

## Test coverage gaps (known)

| Gap | Risk | Mitigation plan |
|---|---|---|
| No skill e2e test (agent invocation) | Medium — a broken skill may not be caught until a human uses it | Manual smoke test per release; consider adding a dry-run install + invocation test |
| No performance benchmark | Low — SC-004 (< 2s search) is not automatically verified | Add a benchmark test for the `search` action against a large fixture index |
| LSP integration test is conditional | Low — LSP path is optional and degrades gracefully | `server/test/lsp-integration.test.mjs` exists but is conditional on `typescript-language-server` being installed; it is skipped in CI environments where the language server is absent. No unconditional integration test. |
