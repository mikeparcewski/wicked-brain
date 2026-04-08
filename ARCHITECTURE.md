# Architecture

wicked-brain has two components: a server and a set of skills. Everything else is markdown on your filesystem.

## System Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│           Your AI Coding CLI                                       │
│    (Claude Code / Gemini / Copilot / Cursor / Codex / Kiro / ...)  │
│                                                                    │
│   ┌───────────────────────────────────────────────────────────┐    │
│   │                       Skills                              │    │
│   │                                                           │    │
│   │   wicked-brain:ingest     Subagent dispatched ──►         │    │
│   │   wicked-brain:search     Parallel subagents ──►──►       │    │
│   │   wicked-brain:compile    Subagent dispatched ──►         │    │
│   │   wicked-brain:query      Subagent dispatched ──►         │    │
│   │   wicked-brain:lint       Subagent dispatched ──►         │    │
│   │   wicked-brain:enhance    Subagent dispatched ──►         │    │
│   │   wicked-brain:read       Inline (direct)                 │    │
│   │   wicked-brain:status     Inline (direct)                 │    │
│   │   wicked-brain:memory     Inline (read/write files)       │    │
│   │   wicked-brain:init       Inline + onboard agent ──►      │    │
│   │   wicked-brain:server     Inline (auto-triggered)         │    │
│   │   wicked-brain:configure  Inline (writes CLI config)      │    │
│   │   wicked-brain:update     Inline (self-update)            │    │
│   │   wicked-brain:retag      Subagent dispatched ──►         │    │
│   │   wicked-brain:batch      Script generation               │    │
│   │   wicked-brain:lsp        Inline → JSON-RPC ──────────►   │    │
│   │                                                           │    │
│   └──────────┬──────────────────────────┬─────────────────────┘    │
│              │                          │                          │
│        Agent tools                 curl localhost                  │
│   (Read, Write, Grep, Glob)       (search, index)                  │
│              │                          │                          │
└──────────────┼──────────────────────────┼───────────────┬──────────┘
               │                          │               │ JSON-RPC
               ▼                          ▼               ▼
┌──────────────────────┐  ┌─────────────────────────┐  ┌──────────────────┐
│                      │  │                         │  │                  │
│   Brain Directory    │  │   wicked-brain-server   │  │  Language Server │
│                      │  │                         │  │  (tsserver,      │
│   brain.json         │  │   POST /api             │  │   pylsp,         │
│   raw/               │  │   ┌───────────────────┐ │  │   rust-analyzer, │
│   chunks/            │  │   │  SQLite FTS5      │ │  │   etc.)          │
│     extracted/       │  │   │  + WAL mode       │ │  │                  │
│     inferred/        │  │   │  + Porter stemmer │ │  │  Auto-installed  │
│     memory/          │  │   │  + Typed links    │ │  │  on first use    │
│   wiki/              │  │   │  + Access log     │ │  │                  │
│     concepts/        │  │   │  + Federation     │ │  └──────────────────┘
│     topics/          │  │   └───────────────────┘ │
│   _meta/             │  │   File watcher           │
│     log.jsonl        │  │   Schema migrations      │
│     config.json      │  │   PID management         │
│     server.pid       │  │   ~300 lines JavaScript  │
│                      │  │                         │
│   .brain.db ◄────────┼──┤   Rebuildable from md   │
│                      │  │                         │
└──────────────────────┘  └─────────────────────────┘
```

## Component Details

### Skills (~1,400 lines of markdown)

Skills are SKILL.md files installed into your AI CLI's skills directory. Each skill is a set of instructions that teaches the agent how to perform a knowledge operation using its native tools.

**Inline skills** run directly in the conversation:
- `wicked-brain:read` — reads a file from disk, parses frontmatter, returns at the requested depth
- `wicked-brain:status` — queries the server for stats, reads config files
- `wicked-brain:init` — creates the brain directory structure
- `wicked-brain:server` — checks if the server is running, starts it if not

**Subagent skills** dispatch a focused worker to do the job:
- `wicked-brain:ingest` — worker reads files, splits into chunks, writes markdown, indexes via API
- `wicked-brain:search` — dispatches one worker per brain (local + parents + links) in parallel
- `wicked-brain:compile` — worker reads chunks, reasons about concepts, writes wiki articles
- `wicked-brain:query` — worker searches, reads, follows links, synthesizes an answer
- `wicked-brain:lint` — worker checks for broken links, orphans, inconsistencies
- `wicked-brain:enhance` — worker identifies gaps, writes inferred chunks

**Utility skills:**
- `wicked-brain:memory` — stores and recalls experiential learnings (decisions, patterns, gotchas) across sessions in working/episodic/semantic tiers
- `wicked-brain:configure` — detects the active CLI and writes brain-aware context into its config file (CLAUDE.md, GEMINI.md, etc.)
- `wicked-brain:retag` — backfills synonym-expanded tags across all chunks for better search recall; safe to interrupt and resume
- `wicked-brain:batch` — generates and runs scripts for bulk operations instead of burning context on repetitive tool calls
- `wicked-brain:update` — checks npm for updates, refreshes skills across CLIs
- `wicked-brain:lsp` — universal code intelligence via LSP; auto-installs language servers and exposes hover/definition/diagnostics/completions to the agent

### Server (~300 lines of JavaScript)

A Node.js HTTP server wrapping SQLite with FTS5. One runtime dependency: `better-sqlite3`.

**Single endpoint:** `POST /api` with `{ "action": "...", "params": {...} }`

| Action | Purpose |
|---|---|
| `health` | Server status and uptime |
| `search` | Full-text search with Porter stemming, snippets, pagination, session diversity ranking |
| `index` | Add or update a document in the FTS index |
| `remove` | Remove a document from the index |
| `reindex` | Replace all documents |
| `backlinks` | Find documents that reference a given path via `[[wikilinks]]` |
| `forward_links` | Find what a document references |
| `federated_search` | Search across multiple brains via SQLite ATTACH |
| `stats` | Document counts, index size, last activity |
| `candidates` | Surface docs for promotion (high-access) or archival (zero-access, zero-backlinks) |
| `recentMemories` | Retrieve memory-tier docs from the last N days |
| `schemaVersion` | Return current schema version for migration diagnostics |

**SQLite schema** (auto-migrated on server start via numbered migrations):

```sql
-- Full-text search
CREATE VIRTUAL TABLE documents_fts USING fts5(
  id, path, content, brain_id,
  tokenize='porter unicode61'
);

-- Metadata
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  frontmatter TEXT,
  brain_id TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

-- Wikilink tracking (typed relationships supported: supersedes, related-to, etc.)
CREATE TABLE links (
  source_id TEXT NOT NULL,
  source_brain TEXT NOT NULL,
  target_path TEXT NOT NULL,
  target_brain TEXT,
  link_text TEXT NOT NULL,
  link_type TEXT           -- null = standard [[wikilink]], non-null = typed relationship
);

-- Access log for session diversity and popularity ranking
CREATE TABLE access_log (
  doc_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  accessed_at TEXT NOT NULL
);
```

WAL mode for concurrent reader safety. Wikilinks are parsed from content on index and stored in the links table for backlink queries. The schema uses a numbered migration system — existing databases upgrade automatically on server restart, no manual steps needed.

**File watcher:** Monitors `chunks/` and `wiki/` for changes. When a `.md` file is created, modified, or deleted, it's automatically reindexed. Uses `fs.watch` with recursive mode on macOS/Windows, falls back to 3-second polling on Linux. Content hashing (SHA-256, 16-char prefix) prevents redundant reindexing.

**Federation:** `federated_search` uses SQLite `ATTACH DATABASE` to query linked brains' `.brain.db` files. Each attached DB is searched, results merged and ranked, then detached. Inaccessible brains are reported as unreachable.

### Brain Directory

```
~/.wicked-brain/
  brain.json              Identity, parents, links
  raw/                    Source files (originals or symlinks)
  chunks/
    extracted/            Source-faithful extractions with YAML frontmatter
    inferred/             LLM-generated content (clearly separated)
    memory/               Experiential learnings (working / episodic / semantic)
  wiki/
    concepts/             Synthesized articles about specific concepts
    topics/               Broader topic articles
    projects/             Per-project onboarding articles (created by onboard agent)
  _meta/
    log.jsonl             Append-only event log
    config.json           Server port, brain path
    server.pid            Running server PID
  .brain.db               SQLite FTS5 index (rebuildable)
```

**Two content layers:**
- `chunks/` is the evidence layer — traceable to specific source files
- `wiki/` is the knowledge layer — synthesized by the LLM with `[[backlinks]]` to source chunks

**Filesystem permissions = access control.** `chmod 700 raw/` restricts source files while leaving `wiki/` readable. No auth system needed.

### Multi-Brain Federation

Brains declare relationships in `brain.json`:

```json
{
  "id": "client-x",
  "parents": ["../company-standards"],
  "links": ["../shared-research"]
}
```

- **Parents** are searched with lower priority (inheritance)
- **Links** are searched as peers (mesh)
- Paths are relative — filesystem resolves access

When `wicked-brain:search` runs, it dispatches parallel subagents, one per accessible brain. Results merge with brain origin tagged on each result.

## Data Flow

```
Source file (PDF, DOCX, MD, code)
    │
    ▼
  raw/                  ← Original, untouched
    │
    │  wicked-brain:ingest (subagent)
    │  ├── Text files: deterministic split (headings / 800-word chunks)
    │  └── Binary files: LLM reads via vision, writes structured chunks
    ▼
  chunks/extracted/     ← YAML frontmatter + extracted content
    │
    │  Server file watcher auto-indexes into SQLite FTS5
    │
    │  wicked-brain:compile (subagent)
    │  └── Reads chunks, reasons about concepts, writes articles
    ▼
  wiki/                 ← Synthesized articles with [[backlinks]]
    │
    │  wicked-brain:lint + wicked-brain:enhance
    │  └── Quality checks, gap filling, feeds back into chunks/
    ▼
    ↺  The brain gets smarter as you use it
```

### LSP Client Layer

The `wicked-brain:lsp` skill wraps Language Server Protocol communication in the agent's native tool calls. When invoked:

1. Checks if the required language server is running (by language/file type)
2. Auto-installs if missing (e.g. `npm install -g typescript-language-server`)
3. Sends JSON-RPC requests: `initialize` → `textDocument/didOpen` → query → `shutdown`
4. Returns structured results: hover types, definition locations, diagnostics, completions

The LSP client uses hand-rolled JSON-RPC over stdio — zero additional npm dependencies. Each language server runs as a child process managed by the skill.

**Supported out of the box:** TypeScript/JavaScript (`typescript-language-server`), Python (`pylsp`), Rust (`rust-analyzer`), Go (`gopls`), Java (`jdtls`). Others can be configured manually.

## What Runs Where

| Component | Runs in | Language | Dependencies |
|---|---|---|---|
| Skills | Your AI CLI's process | Markdown (agent interprets) | None |
| Server | Background process | JavaScript (Node.js) | `better-sqlite3` |
| LSP client | Inline (skill layer) | JSON-RPC via agent tools | None (hand-rolled) |
| Language servers | Child processes | Various | Per language |
| Brain files | Filesystem | Markdown + JSON | None |
| SQLite index | Managed by server | Binary (rebuildable) | None |

Total system: ~300 lines JS + ~1,400 lines markdown. One npm dependency.
