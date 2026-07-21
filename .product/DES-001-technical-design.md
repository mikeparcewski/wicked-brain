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
│  POST /api  ──action dispatch──▶  actions (see docs/wiki)   │
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

`server/bin/wicked-brain-server.mjs` — starts the HTTP server on a configured port, opens the SQLite database for the specified project brain, starts the file watcher.

### Key modules

| Module | Role |
|---|---|
| `server/lib/sqlite-search.mjs` | FTS5 index, migrations, all read/write operations |
| `server/lib/wikilinks.mjs` | Wikilink extraction and resolution |
| `server/lib/file-watcher.mjs` | File change detection; uses `fs.watch` on macOS/Windows, polling fallback on Linux |
| `server/lib/lsp-client.mjs` | Optional LSP integration, hand-rolled JSON-RPC, degrades gracefully if no LSP server available |

### API

Single endpoint: `POST http://localhost:{port}/api`

Request body (JSON): `{ "action": "<action-name>", "params": { ...params } }`

**Actions (40 in `docs/wiki/_generated/actions.json`; the most-used subset):**

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
| `symbols` | Symbol lookup: prefers LSP workspace symbols; falls back to FTS when LSP is unavailable or errored |

---

## Component 2 — Skills

### Installer

`install.mjs` — detects which AI CLI config directories are present on the host machine and copies the skill SKILL.md files into the appropriate location for each CLI.

**Detected CLIs and target directories (verified against `install.mjs`):**

| CLI | Skills target directory |
|---|---|
| Claude Code | `~/.claude/skills/` (or `$CLAUDE_CONFIG_DIR/skills/`) |
| Gemini CLI | `~/.gemini/config/skills/` |
| Copilot CLI | `~/.copilot/skills/` |
| Cursor | `~/.cursor/skills/` |
| Codex | `~/.codex/skills/` |
| Kiro | `~/.kiro/skills/` |
| Antigravity | `~/.gemini/config/skills/` |

### Skill anatomy

Each skill is a directory `skills/wicked-brain-{operation}/` containing a `SKILL.md` file with:
- YAML frontmatter: `name`, `description` (minimum required fields)
- Body: instruction prose for the agent, including what API calls to make and how to interpret results
- "Cross-Platform Notes" section: platform-specific guidance for macOS, Linux, and Windows (most skills include this section; skills that make no platform-specific calls may omit it)

**Naming invariant:** `name` in frontmatter == directory basename. Both use the `wicked-brain-` dash prefix. No colons.

---

## SQLite schema

`.brain.db` is the SQLite index per project brain. Authored content (chunks, memories, wiki articles) lives on disk under the brain directory and is indexed into `.brain.db`; the index is rebuildable from those files.

| Table | Storage engine | Purpose |
|---|---|---|
| `documents` | Standard table | Stores all ingested content (chunks, memories, wiki articles) with metadata and frontmatter. Source type is derived from path prefix (`memory/` or `memories/` → memory, `wiki/` → wiki, otherwise chunk). |
| `documents_fts` | FTS5 virtual table | Full-text index of all documents for ranked search. Mirrors `documents` content. |
| `canonical_ownership` | Standard table | Tracks first-claimant ownership of canonical IDs. |
| `links` | Standard table | Stores extracted wikilinks and relationships (e.g., `contradicts`). |
| `access_log` | Standard table | Records document access history per session. Powers `recent_memories` and `candidates`. |
| `search_misses` | Standard table | Logs queries that returned zero results for gap analysis. |
| `_schema_version` | Standard table | Tracks the current schema migration version. |

Migrations are numbered 1–6 (migrations 7 and 8 were retired with the domain/conformance stores). New schema changes MUST add a new numbered migration; `CREATE TABLE IF NOT EXISTS` does not add columns to existing tables.

---

## Data path

Each project gets its own brain directory:

```
~/.wicked-brain/projects/{project-name}/
  brain.json              # Identity, linked brains
  raw/                    # Source files (copies or symlinks)
  chunks/
    extracted/            # Source-faithful chunk extractions (path prefix: chunks/)
    inferred/             # LLM-generated content (path prefix: chunks/)
  memory/                 # Agent-generated memories (path prefix: memory/ or memories/)
  wiki/                   # Synthesized articles (path prefix: wiki/)
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
