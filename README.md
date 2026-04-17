```
               _      _            _       _               _       
__      _(_) ___| | _____  __| |     | |__  _ __ __ _(_)_ __  
\ \ /\ / / |/ __| |/ / _ \/ _` |_____| '_ \| '__/ _` | | '_ \ 
 \ V  V /| | (__|   <  __/ (_| |_____| |_) | | | (_| | | | | |
  \_/\_/ |_|\___|_|\_\___|\__,_|     |_.__/|_|  \__,_|_|_| |_|
```

**Your AI agent's memory. No vector DB. No embeddings. No infrastructure.**

wicked-brain gives your AI coding CLI a persistent, searchable knowledge base built on markdown and SQLite. Drop in files, let the agent organize them, and query your accumulated knowledge across sessions — all without leaving your terminal.

Works with **Claude Code**, **Gemini CLI**, **Copilot CLI**, **Cursor**, and **Codex**.

---

## The Problem

Every time you start a new AI session, your agent wakes up blank. The context you spent tokens building yesterday? Gone. The architecture decisions, the research, the tribal knowledge — all lost to the session boundary.

The industry's answer has been RAG pipelines: chunk your docs, generate embeddings, spin up a vector database, build a retrieval layer, tune your similarity thresholds, and pray the cosine distance actually surfaces what you need.

**That's a lot of infrastructure for "remember what I told you."**

## A Different Approach

wicked-brain follows the [Karpathy pattern](https://x.com/karpathy): treat the LLM as a research librarian that actively maintains a structured markdown knowledge base. No embeddings. No vector math. Just files, full-text search, and an agent that reasons about connections.

```
Your documents  ──>  Structured chunks  ──>  Synthesized wiki  ──>  Answers
                     (evidence layer)        (knowledge layer)
```

- **Chunks** are source-faithful extractions with rich metadata (entities, themes, tags)
- **Wiki articles** are LLM-synthesized concepts with `[[backlinks]]` to source chunks
- **Links carry confidence** — confirmed connections rank higher, contradictions surface for review
- **Every claim traces back** to a specific file you can read, edit, or delete

The brain is plain markdown on your filesystem. Open it in Obsidian, VS Code, or `cat`. No black box.

## How It Works

wicked-brain is a set of **skills** — markdown instruction files that teach your AI agent how to manage a knowledge base using its native tools (read, write, search, grep).

A lightweight background server handles the one thing that needs a database: full-text search via SQLite FTS5.

```
┌─────────────────────────────────────────┐       ┌──────────────────────┐
│     Your AI CLI (Claude / Gemini / ...) │       │ Browser (you)        │
│                                         │       │ http://localhost/…   │
│  Skills:                                │       │ Search · Wiki viewer │
│    wicked-brain:ingest   → add sources  │       └──────────┬───────────┘
│    wicked-brain:search   → find content │                  │ GET /
│    wicked-brain:query    → ask questions│                  ▼
│    wicked-brain:compile  → build wiki   │       ┌──────────────────────┐
│    wicked-brain:lint     → check quality│       │  Viewer HTML         │
│    wicked-brain:ui       → open viewer  │       └──────────────────────┘
│                                         │
│  Your agent uses its own tools:         │
│  Read, Write, Grep — no special APIs    │
└────────────┬────────────────────────────┘
             │  POST /api (search + index + …)
             ▼
┌─────────────────────────────────────────┐
│  SQLite FTS5 server (auto-starts)       │
│  Optional: --read-only for shared mode  │
└─────────────────────────────────────────┘
```

**The server is invisible.** It auto-starts when needed and auto-reindexes when files change. You never think about it — unless you want to: `open http://localhost:4242/` drops you into a browser viewer that lets you search and browse the wiki without going through an agent.

## Install

```bash
npx wicked-brain
```

That's it. The installer detects your AI CLIs and drops in the skills. First time you use any skill, it walks you through setup.

To install into a non-standard CLI config path:

```bash
npx wicked-brain --path=~/alt-configs/.claude
```

Or install via [agent-skills-cli](https://github.com/Karanjot786/agent-skills-cli):

```bash
skills install wicked-brain
```

## Usage

Once installed, just talk to your agent:

**Ingest a document:**
> "Ingest this research paper" (works with PDF, DOCX, PPTX, XLSX, images — the LLM reads them natively)

**Search your brain:**
> "Search my brain for knowledge graph construction methods"

**Ask a question:**
> "What does my brain say about our SLA enforcement approach?"

**Build wiki articles:**
> "Compile wiki articles from the chunks we've ingested"

**Check health:**
> "What's in my brain?"

Every operation uses **progressive loading** — the agent never pulls more than it needs. Search returns one-line summaries first. You drill down only when something looks relevant.

## Browser Viewer

Every running brain server serves a read-only HTML viewer at `GET /`. Open `http://localhost:4242/` (or whatever port the brain bound to) and you get:

- **Search tab** — type-to-refine with live results and source-type filter chips. Empty query shows every doc most-recent-first so you can browse even when you don't know what to search for.
- **Wiki tab** — grid of cards for each wiki article with tags and word counts.
- **Header actions** — refresh (re-detect mode + re-index from disk) and delete (purge content; typed confirmation required).
- **Read-only mode** — start the server with `--read-only` and destructive actions return 403; the viewer greys out the buttons and tells you why.

Or let an agent do it: say *"open the brain viewer"* and the `wicked-brain:ui` skill resolves the brain, health-checks the server, and launches your default browser.

The viewer has no auth. It's localhost-only, same-machine trust.

## What Makes It Different

| | Vector DB / RAG | wicked-brain |
|---|---|---|
| **Data format** | Opaque embeddings | Human-readable markdown |
| **Search** | Cosine similarity (nearest neighbor) | Full-text search + LLM reasoning |
| **Connections** | None (just similarity scores) | Explicit `[[backlinks]]` between concepts |
| **Auditability** | Low (why did it retrieve this?) | High (every claim links to a source file) |
| **Infrastructure** | Vector DB + embedding pipeline + retrieval service | One SQLite file + markdown |
| **Maintenance** | Re-embed on changes, tune thresholds | Agent self-heals via lint, enhance, and confidence tracking |
| **Cost to start** | Embedding API calls for entire corpus | Zero (deterministic chunking is free) |
| **Ideal scale** | Millions of documents | 100 - 10,000 high-signal documents |

## The Skills

| Skill | What it does |
|---|---|
| `wicked-brain:init` | Set up a new brain — creates structure, starts the server, and ingests your project in one shot |
| `wicked-brain:migrate` | Migrate a legacy flat brain at `~/.wicked-brain/` into the per-project layout |
| `wicked-brain:ingest` | Add source files — text extracted deterministically, binary docs read via LLM vision |
| `wicked-brain:search` | Parallel search across your brain and linked brains |
| `wicked-brain:read` | Progressive loading: depth 0 (stats), depth 1 (summary), depth 2 (full content) |
| `wicked-brain:query` | Answer questions with source citations |
| `wicked-brain:compile` | Synthesize wiki articles from chunks |
| `wicked-brain:lint` | Find broken links, orphan chunks, inconsistencies, tag synonyms, low-confidence links; auto-fix where possible |
| `wicked-brain:enhance` | Identify and fill knowledge gaps with inferred content |
| `wicked-brain:memory` | Store and recall experiential learnings across sessions (working / episodic / semantic tiers) |
| `wicked-brain:status` | Brain health, stats, convergence debt detection, contradiction hotspots |
| `wicked-brain:confirm` | Confirm or contradict a brain link — adjusts confidence score and tracks evidence |
| `wicked-brain:synonyms` | Manage search synonym mappings; auto-suggest from search misses and tag frequency |
| `wicked-brain:server` | Manage the background search server (auto-triggered) |
| `wicked-brain:configure` | Write brain-aware context into your CLI's config (CLAUDE.md, GEMINI.md, etc.) |
| `wicked-brain:batch` | Generate scripts for bulk operations — avoids burning context on repetitive tool calls |
| `wicked-brain:retag` | Backfill synonym-expanded tags across all chunks for better search recall |
| `wicked-brain:update` | Check npm for updates and reinstall skills across all detected CLIs |
| `wicked-brain:lsp` | Universal code intelligence via LSP — hover, go-to-definition, diagnostics, completions |
| `wicked-brain:ui` | Open the read-only browser viewer — Material-styled Search + Wiki tabs over `http://localhost:<port>/` |

## Multi-Brain Federation

Brains can link to other brains. A personal research brain can reference a team standards brain. A client brain can inherit from a company knowledge base.

```json
{
  "id": "client-x",
  "parents": ["../company-standards"],
  "links": ["../shared-research"]
}
```

When you search, wicked-brain dispatches parallel search agents across all accessible brains and merges the results. Access control is filesystem permissions — if you can read the directory, you can search it.

## Per-Project Brains

**Each project gets its own brain.** `wicked-brain:init` creates a brain under
`~/.wicked-brain/projects/{project-name}/` by default, where `{project-name}`
is the basename of your current working directory. This keeps unrelated
codebases, clients, and research domains from crowding a single index — and
makes federated search across projects meaningful.

```
~/.wicked-brain/
  projects/
    my-app/              # one brain per project
    client-site/
    personal-research/
```

Multiple agents can work on different projects simultaneously without stepping
on each other. A supervising "meta-brain" can watch `~/.wicked-brain/projects/*`
and federate queries across all of them via `brain.json` links.

If you really want one brain for everything, you can pass a custom path to
`wicked-brain:init` — but you'll fight the index as it grows.

## What's on Disk

Two places. The **brain** lives in your home directory:

```
~/.wicked-brain/projects/{project-name}/
  brain.json              # Identity and brain links
  raw/                    # Your source files
  chunks/
    extracted/            # Source-faithful extractions with metadata
    inferred/             # LLM-generated content (clearly separated)
  wiki/                   # Synthesized articles with [[backlinks]]
  _meta/
    log.jsonl             # Append-only event log
    config.json           # Server port, source path
  .brain.db               # SQLite search index (auto-managed)
```

And a small per-repo marker lives **in the project itself**:

```
<your-repo>/
  .wicked-brain/
    mode.json             # Detected repo mode + wiki location (gitignore this)
  CLAUDE.md               # Gets a `Contributor wiki: <path>` pointer stamped in
```

`mode.json` records whether the repo is `code` / `content` / `mixed` / `unknown` and where the contributor wiki lives (`wiki/`, `docs/wiki/`, etc.). Agents read it first when they need to find the wiki — it's the canonical discovery hint.

Everything is markdown. Everything is git-committable (except the brain's `.brain.db` and the per-repo `.wicked-brain/`). Everything is human-readable. The SQLite file is a rebuildable cache — delete it and the server recreates it from your markdown files.

## The Agent is the Parser

No `pdf-parse`. No `mammoth`. No `pptx-parser`.

Modern LLMs read PDF, DOCX, PPTX, and XLSX natively. When you ingest a binary document, the agent reads it with its vision capabilities and writes structured markdown chunks. Better extraction than any library, with semantic understanding built in.

## Architecture

Plain Node.js server (SQLite FTS5 + file watcher + optional LSP client + HTML viewer) plus markdown skill instructions your AI CLI consumes. **One runtime dependency** (`better-sqlite3`); LSP layer is hand-rolled JSON-RPC; the viewer is vanilla JS with no build.

Compare that to a typical RAG stack:

```
Typical RAG:                           wicked-brain:
- Embedding model API                 - SQLite (one file)
- Vector database (Pinecone/Weaviate) - Markdown files
- Chunking pipeline                   - Agent's native tools
- Retrieval service                   - curl localhost (POST /api)
- Re-ranking model                    - LLM reasoning
- Orchestration layer                 - Skills (markdown)
- Admin UI                            - GET / (vanilla HTML, read-only)
─────────────────                     ─────────────────
10+ deps, opaque vectors              1 runtime dep, plain markdown
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for component diagrams and the schema layout.

## Supported CLIs

| CLI | Status |
|---|---|
| Claude Code | Supported |
| Gemini CLI | Supported |
| GitHub Copilot CLI | Supported |
| Cursor | Supported |
| Codex | Supported |
| Kiro | Supported |
| Antigravity | Supported |

Skills use only universally available operations (read files, write files, run shell commands, grep). No CLI-specific features.

## Philosophy

> "You rarely ever write or edit the wiki manually; it's the domain of the LLM." — Andrej Karpathy

wicked-brain is built on three beliefs:

1. **Files over databases.** Markdown is the most LLM-friendly, human-readable, future-proof format. Your knowledge shouldn't be locked in embeddings you can't read.

2. **Reasoning over retrieval.** An LLM that reads summaries, follows links, and thinks about connections beats a nearest-neighbor lookup every time — at least for the scale most teams actually operate at.

3. **Skills over infrastructure.** The agent already knows how to read, write, and search files. Teach it a workflow and it becomes a knowledge manager. No new services to deploy.

## License

MIT
