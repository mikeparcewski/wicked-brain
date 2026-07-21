---
name: REQ-001-application-overview
title: "wicked-brain — Application Overview"
status: draft
version: 0.1
date: 2026-07-21
author: michael.parcewski@accenture.com
review-required: true
---

# REQ-001 — Application Overview

## What wicked-brain is

wicked-brain is a memory and knowledge store for AI coding agents, currently in a **bridge period**. It provides a lightweight, local-first infrastructure layer that gives AI CLIs (Claude Code, Gemini CLI, Copilot CLI, Cursor, Codex, Antigravity) a persistent, searchable brain — indexed content, stored memories, synthesized wiki articles, and wikilink graphs — backed by SQLite FTS5 with no external infrastructure.

It ships as two npm packages:
- `wicked-brain` — the skill set and installer (SKILL.md files + `install.mjs`)
- `wicked-brain-server` — the HTTP server wrapping the SQLite store

It is not a long-term architectural destination. Its memory and knowledge role is planned to fold into the **wicked-estate MCP server** once estate reaches v1.0. Until then, wicked-brain is the canonical bridge-period tool.

### Bridge-period scope

wicked-brain owns: session-scoped memory, indexed project content (chunks), wiki articles, wikilink graphs, access logging, and the skill surface that AI agents use to interact with all of the above.

wicked-brain does **not** own: the code graph (estate), domain modeling (estate, via wicked-core), workflow governance (wicked-crew), test execution (wicked-testing). The domain/conformance JS stores were retired (see `RET-BRAIN-DOMAIN-001-retirement.md`).

---

## Core user flows

### Flow 1 — Install skills into a CLI
1. The user runs `node install.mjs` (or `npx wicked-brain install`) in the project root.
2. `install.mjs` detects which AI CLI config directories are present (Claude Code `~/.claude/`, Gemini CLI, Copilot CLI, Cursor, Codex, Antigravity).
3. For each detected CLI, it copies the 27 SKILL.md files into the appropriate skills/agents directory.
4. The CLIs pick up the installed skills on next startup; agents can now invoke `wicked-brain-search`, `wicked-brain-memory`, etc.

### Flow 2 — Index a project
1. The agent (or user) invokes the `wicked-brain-ingest` skill, providing the project path and a brain name.
2. The skill calls `POST /api` with `action: index` for each source file or directory.
3. The server parses frontmatter, extracts chunks, and writes them to the SQLite FTS5 `chunks` table.
4. Wikilinks are resolved and stored in the `wiki` table. The file watcher monitors for subsequent changes and reindexes automatically.

### Flow 3 — Search or query the brain
1. The agent invokes `wicked-brain-search` or `wicked-brain-query`.
2. The skill calls `POST /api` with `action: search` (or `federated_search` for cross-brain search).
3. The server runs an FTS5 ranked query against `chunks`, `memories`, and `wiki`.
4. Results are returned ranked by relevance; the agent synthesizes an answer or surfaces the excerpts.

### Flow 4 — Store a memory
1. The agent invokes `wicked-brain-memory` (store mode) with a key, value, and optional tags.
2. The skill calls `POST /api` with `action: index` targeting a memory file under `chunks/inferred/`.
3. The server persists the memory entry; it is immediately searchable and returned by `recent_memories`.
4. Memories can be promoted, contradicted, confirmed, or forgotten via the corresponding skill/action pairs.

---

## Success criteria

| ID | Criterion | Verification method |
|---|---|---|
| SC-001 | Skills install successfully into 2 or more supported CLIs (minimum: Claude Code + one other) | Manual install + skill invocation |
| SC-002 | All 396 tests pass with zero failures | `cd server && node --test` |
| SC-003 | Server starts and all 18 API actions respond correctly on macOS, Linux, and Windows | CI matrix (ubuntu + macos + windows) |
| SC-004 | `search` action returns ranked results in under 2 seconds for a 10,000-chunk index | Measured in test or benchmark (to be verified) |
| SC-005 | Bridge-period integration: when wicked-estate is present, skills surface estate context alongside brain results without double-owning the domain layer | Cross-product integration test (to be verified) |
