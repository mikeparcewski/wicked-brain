# Support Wiki Format Spec

## Problem

Onboarding currently produces narrative chunks (structure, architecture, conventions, dependencies, build-deploy) that answer "how does this work?" but not "what does this export?", "how do I verify it works?", or "what do I check when it breaks?". Different roles need different views of the same project.

## Design

### 5 perspective-based wiki articles per project

Each project onboard produces 5 wiki articles under `wiki/projects/{name}/`:

| Article | Audience | Depth 0 (~5 tokens) | Depth 1 (~50-100 tokens) | Depth 2 (full) |
|---------|----------|---------------------|--------------------------|----------------|
| `product.md` | Product, users | Feature count + version | Feature list + capabilities | Examples, limitations, version history |
| `engineering.md` | Engineers | Component count + languages | Module map + data flow | Symbols, signatures, extension points |
| `quality.md` | Testers, QE | Test count + coverage summary | Capability matrix | Verification scenarios, curl examples, edge cases |
| `operations.md` | Ops, SRE | Config file count + health summary | Troubleshooting index | Full playbooks, monitoring guide, upgrade path |
| `data.md` | Data eng, DBA | Source count + schema summary | Table/schema list + constraints | Full lifecycle, integrity rules, rebuild procedures |

### Progressive loading via existing brain:read

No code changes needed. `brain:read` already supports depth 0/1/2 and section extraction. The wiki articles just need to be structured so each tier is independently useful.

### Frontmatter contract

Each article carries structured frontmatter for depth-0 retrieval:

```yaml
---
title: Engineering
type: support-wiki
perspective: engineering
project: {project-name}
authored_by: onboard
authored_at: {ISO timestamp}
stats:
  components: 4
  languages: [javascript]
  dependencies: 3
  entry_points: 5
  exported_symbols: 47
sections:
  - name: Architecture
    line: 15
    summary: "HTTP server + SQLite FTS5 + file watcher + LSP client"
  - name: Dependencies
    line: 42
    summary: "1 runtime (better-sqlite3), 0 build deps"
  - name: Entry Points
    line: 58
    summary: "HTTP POST /api, CLI flags, file system watcher, SIGTERM/SIGINT, PID file"
  - name: Module Map
    line: 85
    summary: "6 modules in server/lib/, 22 skills"
  - name: Exported Symbols
    line: 120
    summary: "SqliteSearch (18 methods), FileWatcher, LspClient, deriveSourceType"
  - name: Extension Points
    line: 180
    summary: "Add action to dispatch object, add migration, add skill directory"
contains:
  - architecture
  - modules
  - dependencies
  - symbols
  - api
---
```

The `stats` block gives depth-0 consumers a numeric summary without reading the body. The `sections` block gives depth-1 consumers a table of contents with one-line summaries. Both are machine-parseable from frontmatter alone.

### Article body structure

Each article follows the same pattern — sections map to the frontmatter index:

```markdown
# {Perspective}: {Project Name}

## {Section 1}

{First paragraph is the depth-1 summary for this section.}

{Remaining paragraphs are depth-2 detail.}

## {Section 2}
...
```

The first paragraph under each `##` heading serves as the depth-1 excerpt. Everything after is depth-2. This is a convention, not enforced by code — it works because `brain:read` at depth 1 returns "first paragraph + section headings."

## Chunk-to-Wiki Pipeline

### Onboard produces 5 perspective chunks

Instead of the current generic chunks, onboard writes:

```
chunks/extracted/project-{name}/
  chunk-product.md        # features, capabilities, limitations
  chunk-engineering.md    # architecture, modules, symbols, entry points
  chunk-quality.md        # test infrastructure, coverage, verification approaches
  chunk-operations.md     # config, startup/shutdown, health, troubleshooting
  chunk-data.md           # storage, schema, constraints, lifecycle
  chunk-symbols.md        # exported symbols per module (from LSP/grep) — feeds into engineering.md
```

Each chunk has `type: support-wiki` and `perspective: {name}` in frontmatter so compile can route them correctly.

### Compile recognizes support-wiki chunks

When compile encounters chunks with `type: support-wiki`, it:

1. Groups them by `perspective`
2. Writes to `wiki/projects/{name}/{perspective}.md` instead of `wiki/concepts/`
3. Uses **aggregation mode** (structured assembly) instead of LLM narrative synthesis for symbols and data sections
4. Uses **synthesis mode** (existing persona-based) for product and engineering narrative sections
5. Generates the `stats` and `sections` frontmatter from the content

### What changes vs current pipeline

| Step | Current | New |
|------|---------|-----|
| Onboard chunks | 5 topic-based (structure, arch, conventions, deps, build) | 6 perspective-based (product, engineering, quality, ops, data, symbols) |
| Compile routing | All → `wiki/concepts/` | `type: support-wiki` → `wiki/projects/{name}/` |
| Compile mode | Always LLM synthesis | Synthesis for narrative sections, aggregation for structural sections |
| Frontmatter | Basic (authored_by, confidence, contains) | Extended (stats, sections index for progressive loading) |

## Context Cost Analysis

**Per-session cost of loading the support wiki at depth 0:**

5 articles x ~5 tokens (stats from frontmatter) = ~25 tokens

Compare to current: narrative wiki articles loaded at depth 1 = ~500 tokens for similar coverage, but without structural specifics.

**Depth 1 (when working in an area):**

1 article x ~100 tokens (section summaries) = ~100 tokens

**Depth 2 (full detail for a specific section):**

1 section x ~200-500 tokens = variable, loaded on demand

The progressive design means total indexed content can grow significantly without increasing per-turn context cost.

## Scope

### V1 (this change)
- Reshape onboard chunks to 5 perspectives + symbols
- Update compile to route support-wiki chunks to `wiki/projects/`
- Frontmatter with stats + sections index
- JS/TS symbol extraction only (LSP first, grep fallback)

### Future
- Live verification in quality.md (curl examples run against test server)
- Staleness detection (file watcher marks articles stale when source files change)
- CI integration (re-run onboard docs on release)
- Multi-language symbol extraction
