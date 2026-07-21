---
name: DES-001-technical-design
title: "wicked-brain — Technical Design"
status: draft
version: 0.1
date: 2026-07-21
author: michael.parcewski@accenture.com
review-required: true
---

# DES-001 — Technical Design

## Architecture overview

wicked-brain is a two-component system:

```
┌─────────────────────────────────────────────────────────────┐
│  wicked-brain-server (npm package)                          │
│                                                             │
│  Node.js HTTP server                                        │
│  POST /api  ──action dispatch──▶  18 actions               │
│                 │                                           │
│                 ▼                                           │
│  sqlite-search.mjs  (FTS5 index + migrations)              │
│  wikilinks.mjs      (wikilink graph)                        │
│  file-watcher.mjs   (auto-reindex, polling fallback)        │
│  lsp-client.mjs     (optional, hand-rolled JSON-RPC)        │
│                 │                                           │
│                 ▼                                           │
│  ~/.wicked-brain/projects/{project-name}/.brain.db          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  wicked-brain (npm package)                                 │
│                                                             │
│  install.mjs         — detects CLIs, copies SKILL.md files │
│  skills/             — 27 skill directories                 │
│    wicked-brain-*/SKILL.md                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Component 1 — Server

### Entry point

`server/bin/wicked-brain-server` — starts the HTTP server on a configured port, opens the SQLite database for the specified project brain, starts the file watcher.

### Key modules

| Module | Role |
|---|---|
| `server/lib/sqlite-search.mjs` | FTS5 index, migrations, all read/write operations |
| `server/lib/wikilinks.mjs` | Wikilink extraction and resolution |
| `server/lib/file-watcher.mjs` | File change detection; uses `fs.watch` on macOS/Windows, polling fallback on Linux |
| `server/lib/lsp-client.mjs` | Optional LSP integration, hand-rolled JSON-RPC, degrades gracefully if no LSP server available |

### API

Single endpoint: `POST http://localhost:{port}/api`

Request body (JSON): `{ "action": "<action-name>", ...params }`

**18 actions:**

| Action | Description |
|---|---|
| `health` | Server liveness and database path |
| `search` | FTS5 ranked full-text search across chunks, memories, wiki |
| `federated_search` | Search across multiple linked brains |
| `index` | Ingest a file or content block into the FTS5 index |
| `remove` | Remove a file or key from the index |
| `reindex` | Rebuild the FTS5 index for the project |
| `backlinks` | Return all documents that link to a given document |
| `forward_links` | Return all wikilinks from a given document |
| `stats` | Chunk count, memory count, wiki article count, database size |
| `candidates` | Surface candidates for promotion or review |
| `access_log` | Append an access record (which documents were surfaced) |
| `recent_memories` | Return most recently accessed or created memories |
| `contradictions` | Return pairs of memories with conflicting claims |
| `confirm_link` | Mark a wikilink as confirmed (human-verified) |
| `link_health` | Report on broken or unresolved wikilinks |
| `tag_frequency` | Return tag usage frequency across indexed content |
| `search_misses` | Return queries that returned no results (for gap analysis) |

---

## Component 2 — Skills

### Installer

`install.mjs` — detects which AI CLI config directories are present on the host machine and copies the skill SKILL.md files into the appropriate location for each CLI.

**Detected CLIs and target directories (approximate — to be verified against current install.mjs):**

| CLI | Config dir detection |
|---|---|
| Claude Code | `~/.claude/` (agents or skills subdirectory) |
| Gemini CLI | (to be verified) |
| Copilot CLI | (to be verified) |
| Cursor | (to be verified) |
| Codex | (to be verified) |
| Antigravity | (to be verified) |

### Skill anatomy

Each skill is a directory `skills/wicked-brain-{operation}/` containing a `SKILL.md` file with:
- YAML frontmatter: `name`, `description` (minimum required fields)
- Body: instruction prose for the agent, including what API calls to make and how to interpret results
- "Cross-Platform Notes" section: platform-specific guidance for macOS, Linux, and Windows

**Naming invariant:** `name` in frontmatter == directory basename. Both use the `wicked-brain-` dash prefix. No colons.

---

## SQLite schema

All state lives in a single `.brain.db` file per project brain.

| Table | Storage engine | Purpose |
|---|---|---|
| `chunks` | FTS5 virtual table | Full-text index of all ingested content (source files, memories, wiki articles). Primary search target. |
| `memories` | Standard table | Structured memory records with key, value, tags, timestamp, promotion status. |
| `wiki` | Standard table | Synthesized wiki articles and their wikilink graphs. |
| `access_log` | Standard table | Records of which documents were surfaced per query session. Powers `recent_memories` and `candidates`. |
| `tags` | Standard table (or FTS metadata) | Tag associations for chunks and memories; powers `tag_frequency`. |
| `_migrations` | Standard table | Migration version tracking; ensures cumulative, numbered migrations apply once. |

Migrations are numbered 1–6 (migrations 7 and 8 were retired with the domain/conformance stores). New schema changes MUST add a new numbered migration; `CREATE TABLE IF NOT EXISTS` does not add columns to existing tables.

---

## Data path

Each project gets its own brain directory:

```
~/.wicked-brain/projects/{project-name}/
  brain.json              # Identity, linked brains
  raw/                    # Source files (copies or symlinks)
  chunks/extracted/       # Source-faithful chunk extractions
  chunks/inferred/        # LLM-generated content (memories, summaries)
  wiki/                   # Synthesized articles
  _meta/log.jsonl         # Event log
  _meta/config.json       # Server port, brain path
  _meta/server.pid        # Running server PID
  .brain.db               # SQLite index (rebuildable from raw/)
```

On Windows: `%USERPROFILE%\.wicked-brain\projects\{project-name}\`

The parent `~/.wicked-brain/` is a container for per-project brains — never a brain itself.

---

## Bridge-period seam

When wicked-estate MCP server is present (running and accessible via MCP), skills should prefer estate for:
- Code graph queries (symbols, edges, cross-file references)
- Domain model facts (requirements graph, conformance)

Brain continues to own:
- Session-scoped memory (`wicked-brain-memory`)
- Indexed project content (chunks, wiki)
- Wikilink graphs
- Access log and search-miss analysis

The seam is soft — brain skills note "prefer estate when present" rather than hard-failing when estate is absent. The migration path (brain → estate for memory/knowledge) is tracked as an open DoD item in `REQ-005-dod-criteria.md`.

---

## Technology choices

| Concern | Choice | Rationale |
|---|---|---|
| Language | Plain ESM JavaScript | No build step, shallow dep surface, directly inspectable |
| Storage | SQLite FTS5 via `better-sqlite3` | Local-first, zero infra, ACID/WAL, ranked search |
| Test runner | `node:test` (stdlib) | Zero test framework dependencies |
| LSP integration | Hand-rolled JSON-RPC | Zero new runtime deps; LSP is optional |
| HTTP | Node.js `http` stdlib | No framework overhead for a single-endpoint server |
| File watching | `fs.watch` + polling fallback | Platform parity: macOS/Windows get native events; Linux gets polling |
