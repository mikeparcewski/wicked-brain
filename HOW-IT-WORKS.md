# How It Works

Why wicked-brain is efficient, simple, and practical for teams — and why it doesn't need the infrastructure you think it does.

## The Core Insight

Every AI coding session starts the same way: the agent has no memory. Your architecture decisions, your research, your team's tribal knowledge — gone. You spend tokens and time rebuilding context.

The industry's answer has been RAG (Retrieval-Augmented Generation): embed your documents as vectors, store them in a specialized database, retrieve by similarity. It works, but it's a lot of machinery for what is fundamentally a search problem.

wicked-brain takes a different approach: **structured markdown files + full-text search + an agent that reasons about connections.** No embeddings. No vector math. No infrastructure beyond a single SQLite file.

## Why This Works

### 1. Full-Text Search Beats Vector Similarity at This Scale

Vector similarity search finds "things that look like your query." Full-text search finds "things that contain your terms." For knowledge bases under 10,000 documents, full-text search with a good tokenizer (Porter stemming) is:

- **Faster** — sub-millisecond queries vs. ANN lookup overhead
- **More predictable** — you know why something matched (it contained the term)
- **Auditable** — the match is in the text, not in an opaque 1536-dimensional space
- **Free to maintain** — no re-embedding when content changes

The LLM provides the semantic understanding that vector search tries to approximate. It reads the search results and *reasons* about relevance, connections, and gaps — something no retrieval algorithm does.

### 2. Progressive Loading Controls Context Budget

The biggest cost in AI workflows isn't compute — it's context. Every token in the context window costs money and dilutes attention. Traditional approaches load entire documents. wicked-brain never loads more than you need.

**Three depth levels:**

```
Depth 0: One-line summary       ~5 tokens per result
Depth 1: Frontmatter + synopsis ~50-100 tokens per result
Depth 2: Full content            Variable (only when needed)
```

A typical search returns 10 results at depth 0 — that's ~50 tokens. The agent reads 2-3 at depth 1 (~200 tokens) to confirm relevance. It reads 1-2 at depth 2 for the actual content it needs.

**Total: ~2,000-5,000 tokens to find and read the right content from 600+ documents.**

Without progressive loading, reading those same 600 documents would cost ~1.5 million tokens. That's a **300x difference** in context efficiency.

### 3. The Agent is the Parser (No Binary Libraries)

Traditional document processing requires libraries for every format: `pdf-parse` for PDFs, `mammoth` for DOCX, `pptx-parser` for slides. Each adds dependencies, version conflicts, and extraction bugs.

Modern LLMs read PDF, DOCX, PPTX, XLSX, and images natively via their vision capabilities. When you ingest a binary document, the agent:

1. Reads the file as a base64 attachment
2. Examines it visually — understands layout, tables, charts, diagrams
3. Writes structured markdown chunks with rich metadata

This produces *better* extraction than any library because the agent understands context, not just text layout. A PDF table becomes a proper markdown table. A diagram becomes a description with entities and relationships. A slide deck becomes one chunk per slide with narrative themes.

**Zero binary parsing dependencies. Better results.**

### 4. Skills Make It Zero-Config for Teams

There's nothing to deploy, no API keys to configure, no service to maintain. A developer runs:

```bash
npx wicked-brain
```

Skills are installed into their AI CLI. The first time they invoke `wicked-brain:init`, it handles everything in one shot: creates the brain directory structure, starts the background server (on a free port — no port configuration required), and immediately ingests the current project. By the time init finishes, the brain is queryable. The server auto-reindexes when files change.

**What the team manages:**
- A directory of markdown files (git-committable, human-readable)
- A `brain.json` that says what this brain is and what it links to

**What the team doesn't manage:**
- No vector database (Pinecone, Weaviate, Chroma)
- No embedding pipeline
- No retrieval service
- No re-indexing jobs
- No similarity threshold tuning
- No chunking strategy experimentation

### 5. The Brain Compounds Over Time

This is the Karpathy insight: the brain isn't static. Every query, every compilation, every lint pass makes it smarter.

**The compound loop:**

```
Ingest sources → Chunks (evidence)
     ↓
Compile → Wiki articles (knowledge)
     ↓
Lint → Fix inconsistencies, add connections
     ↓
Enhance → Fill gaps with inferred content
     ↓
Query → Synthesize answers, file results back as new articles
     ↓
Memory → Store decisions, patterns, gotchas across sessions
     ↓
Repeat → The brain knows more after every session
```

When a new team member onboards, they don't just search raw docs — they search a curated, interlinked knowledge base that previous sessions have refined. Wiki articles cite source chunks. Source chunks link to related concepts. The agent follows these connections, building richer answers than any search engine could.

**Memory is different from chunks.** Chunks are extracted from source files — factual, traceable, evidence-based. Memory stores *experiential* knowledge: the architectural decision your team debated for a week, the gotcha that burned two developers, the pattern that works reliably in your specific stack. Three tiers:

- **Working** — active session context, expires quickly
- **Episodic** — specific past events and decisions (survives session boundaries)
- **Semantic** — generalized patterns extracted from repeated experience

Memory files are just markdown in `chunks/memory/` — searchable, auditable, editable.

### 5a. Typed Relationships

Wikilinks in wicked-brain can carry semantic meaning:

```markdown
[[supersedes::old-approach]]
[[related-to::auth-design]]
[[inspired-by::karpathy-pattern]]
```

These typed relationships are stored in the links table and queryable via the server API. The lint skill checks for broken typed links. The compile skill uses them when synthesizing wiki articles. This lets the brain encode *how* concepts relate, not just *that* they do.

### 5b. Search Gets Smarter With Use

Every search is logged against a session ID. The server tracks which documents each session has accessed — and uses this to diversify results over time. If you've read a chunk three times this session, it's deprioritized in favor of related content you haven't seen yet. Popular documents (accessed across many sessions) get a ranking boost.

This means the search results you see on day 30 are better than day 1 — not because you re-indexed anything, but because the access patterns tell the brain what's actually useful.

### 6. Code Intelligence Without a Plugin

wicked-brain includes an LSP (Language Server Protocol) client. This means your agent can ask any language server — TypeScript, Python, Rust, Go, Java — for hover information, go-to-definition, diagnostics, and completions, without a browser, without an IDE plugin, and without reading the entire codebase.

```
Agent asks: "What does this function return?"
     ↓
wicked-brain:lsp → starts language server if not running
     ↓
Sends textDocument/hover request
     ↓
Returns: type signature, docstring, inferred return type
```

Language servers are installed automatically if missing (e.g. `npm install -g typescript-language-server`). The LSP layer uses hand-rolled JSON-RPC — zero new dependencies beyond what the language server itself needs.

**Why this matters:** An agent navigating a large codebase normally has to read many files to trace a type through several layers of abstraction. With LSP, it asks once and gets the answer. For deep codebases, this can reduce code-navigation token usage by 10-50x.

**Symbol graph.** Beyond per-file queries, wicked-brain exposes workspace-level symbol lookup. Ask "where is `UserEntity` defined?" without knowing which file it lives in:

```
GET symbols?name=UserEntity
     ↓
LSP workspace/symbol query (all open language servers)
     → falls back to FTS search of indexed chunks
     ↓
Returns: file path, line number, type (class / function / interface / …)

GET dependents?name=UserEntity
     ↓
FTS search across all indexed chunks
     ↓
Returns: every source file that mentions the symbol
```

This is the foundation for multi-file patch commands — knowing which files need updating when a type or interface changes.

### 8. Multi-Brain Federation is Just Filesystem Permissions

Traditional knowledge management systems need complex access control: roles, permissions, sharing policies, admin dashboards. wicked-brain uses the operating system.

```json
{
  "id": "client-x-brain",
  "parents": ["../company-standards"],
  "links": ["../shared-research"]
}
```

- Can you read the directory? You can search it.
- Can't read it? You can't. The search reports it as unreachable.

A client-specific brain inherits from a company-standards brain. A personal research brain links to a team brain. Each is a directory with its own permissions. No admin console needed.

Federated search dispatches parallel subagents — one per accessible brain — and merges results. SQLite's `ATTACH DATABASE` makes cross-brain queries sub-millisecond.

## What The Numbers Show

We tested with 608 indexed documents (a codebase + AI engineering bootcamp materials) and four different personas:

| Persona | Task | Tokens Used | vs. Reading All Files | Improvement |
|---|---|---|---|---|
| Software Architect | Architecture assessment | ~22,000 | ~1,500,000 | **68x** |
| Business Analyst | Value analysis | ~50,000 | ~1,500,000 | **30x** |
| Marketing Lead | Keynote outline | ~20,000 | ~1,500,000 | **75x** |
| Lead Developer | Onboarding guide | ~80,000 | ~1,500,000 | **19x** |

**Average: ~48x context reduction.** The agent finds what it needs from 600+ documents by reading 5-20 of them.

Even the worst case (Lead Developer, 19x) outperforms the naive approach by an order of magnitude — and that case hit zero search results due to vocabulary mismatch, forcing a fallback to directory browsing. When search works well, the improvement is 30-75x.

### Why the range?

- **68-75x** — Targeted queries that match indexed vocabulary. The Architect searched for "backend API endpoints routes FastAPI" and the FTS5 index returned exactly the right chunks.
- **30x** — Broader analytical queries that require reading more chunks to synthesize a complete picture. The Business Analyst needed 17 full reads to build an evidence-based analysis.
- **19x** — Search vocabulary mismatch. The developer searched for "setup development environment" but chunks were indexed with different terms. The brain's structure still helped (organized directories, frontmatter metadata), just not as dramatically.

## The Stack Comparison

```
Traditional RAG Stack:              wicked-brain:
─────────────────────               ──────────────
Embedding model API                 (nothing)
Vector database service             SQLite file
Chunking pipeline                   Agent splits on headings
Embedding pipeline                  (nothing)
Retrieval service                   curl localhost
Re-ranking model                    Agent reasons about relevance
Orchestration layer                 Skills (markdown)
Admin dashboard                     ls -la
─────────────────────               ──────────────
~5,000+ lines of code               ~300 lines JS
10+ dependencies                    1 dependency
3+ services to deploy               1 auto-starting process
Dedicated infrastructure            Your laptop
Monthly embedding costs             $0
Re-index on every change            Auto-reindex via file watcher
Opaque retrieval                    Human-readable markdown
```

## Why Teams Adopt This

**Week 1:** One person installs it, ingests the team's docs. 10 minutes.

**Week 2:** The team starts querying. "What does our brain say about the SLA policy?" Results are instant, cited, and traceable to source documents.

**Week 3:** Someone runs `wicked-brain:compile`. The brain generates wiki articles that synthesize scattered information into coherent concepts. These articles become the team's reference material.

**Week 4:** A new team member joins. Instead of reading 50 docs, they ask the brain. The onboarding guide the brain writes cites the same source docs — but organized around what a newcomer actually needs to know.

**Month 2:** The brain has been through several lint and enhance cycles. Broken links are fixed. Gaps are filled. Cross-references connect concepts that were scattered across different documents. The brain knows more than any single team member.

**The team never deployed a service, configured an API key, or tuned a similarity threshold.** They just used their AI CLI the way they already do — and now it remembers.

## Frequently Asked Questions

**"Does it scale to millions of documents?"**

No. And it's not trying to. wicked-brain is designed for 100-10,000 high-signal documents — the scale at which most teams actually operate. If you have millions of documents, you need a vector database. If you have a few hundred docs that your team actually reads, you need wicked-brain.

**"What if the search doesn't find what I need?"**

The agent falls back gracefully. It can grep the files directly, browse the directory structure, or read the wiki index. You degrade to baseline performance (reading files), not to failure. And every miss improves the brain — the lint skill identifies coverage gaps, and the enhance skill fills them.

**"Is the SQLite file a single point of failure?"**

No. It's a rebuildable cache. Delete `.brain.db` and the server recreates it from the markdown files on next start. The markdown is the source of truth. The SQLite is just a fast lookup layer.

**"What about concurrent access?"**

SQLite WAL mode supports concurrent readers. The file watcher debounces writes (500ms). For write-heavy operations (bulk ingest), the batch skill generates a script that handles everything in a single process. Two people searching simultaneously is fine. Two people ingesting simultaneously — the server handles it via SQLite's built-in locking.

**"Why not just use Obsidian / Notion / Confluence?"**

Those are apps for humans. wicked-brain is infrastructure for AI agents. The difference: an agent can search, read, reason about, and write to a wicked-brain in seconds. It can't do that with a Notion workspace or a Confluence wiki — those require browser automation, API keys, and pagination. Markdown on a filesystem is the most LLM-friendly format that exists.

That said, you *can* view your brain in Obsidian. The `[[wikilinks]]` render as navigable connections. The directory structure maps to Obsidian's file explorer. The brain is a valid Obsidian vault. Best of both worlds.

**"Why markdown and not a database?"**

Because markdown is:
- Human-readable (open any file in any editor)
- Git-committable (version control for free)
- LLM-native (the format every model understands best)
- Future-proof (plain text never goes obsolete)
- Editable (fix an error by editing a file, not running a migration)

The database (SQLite) exists only as a search index. It's derived from the markdown, not the other way around.
