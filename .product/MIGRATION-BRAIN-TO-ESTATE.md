---
name: MIGRATION-BRAIN-TO-ESTATE
title: "wicked-brain → wicked-estate Migration Guide"
status: draft
version: 0.1
date: 2026-07-21
author: michael.parcewski@accenture.com
---

# Bridge-Period Migration Guide: wicked-brain → wicked-estate

This guide covers the migration path for users moving from wicked-brain's memory and knowledge surfaces to wicked-estate's native MCP tools, which absorb those responsibilities at the end of the bridge period.

**When to migrate**: when wicked-estate v1.0 ships and you have verified that the estate MCP server is running and accessible in your agent sessions. Brain remains fully supported during the bridge period — do not migrate prematurely.

---

## What is changing

wicked-brain is a bridge-period tool. It provides memory and knowledge indexing via a local HTTP server + SQLite FTS5 index. During the bridge period, brain is the authoritative store for:

- Session-scoped memory (wicked-brain-memory)
- Indexed project content — chunks, wiki articles, wikilinks
- Access log and search-miss analysis

wicked-estate absorbs these responsibilities permanently. Estate is an MCP server (stdio JSON-RPC) exposing 23 tools across 3 domains, including 6 memory tools and 7 knowledge tools that replace brain's core surfaces.

---

## Skill-to-tool mapping

| Brain skill | Brain action | Estate MCP tool | Notes |
|------------|--------------|-----------------|-------|
| `wicked-brain-memory` | store | `memory.capture` | Captures a memory with metadata |
| `wicked-brain-memory` | recall | `memory.recall` | Retrieves memories by semantic query |
| `wicked-brain-memory` | reflect | `memory.reflect` | Synthesizes patterns across memories |
| `wicked-brain-memory` | forget | `memory.erase` | Removes a specific memory |
| `wicked-brain-memory` | learn | `memory.learn` | Derives memories from conversation |
| `wicked-brain-search` | (search) | `SearchEntity` | Entity search across the code graph |
| `wicked-brain-query` | (query) | `knowledge.recall` | Semantic recall from knowledge store |
| `wicked-brain-ingest` | (ingest) | `knowledge.ingest` | Ingests content into knowledge store |
| `wicked-brain-read` | (read wiki) | `knowledge.recall` | Retrieve structured knowledge |
| `wicked-brain-context` | (context) | `ContextBundle` | Surface relevant context for current session |
| `wicked-brain-consolidate` | (consolidate) | `memory.reflect` | Pattern synthesis (manual trigger is replaced by estate's continuous consolidation) |
| `wicked-brain-session-teardown` | (teardown) | `memory.learn` | Post-session memory capture |

---

## What stays in brain (no estate equivalent)

The following brain capabilities have no direct estate counterpart and are out of scope for this migration:

| Brain capability | Status |
|-----------------|--------|
| LSP workspace symbols (`wicked-brain-lsp`) | Estate does not provide LSP; remains in brain or falls to agent-native tooling |
| File watcher / auto-reindex | Estate's knowledge store is ingestion-driven; no auto-watcher |
| Wikilink graph traversal | Estate provides `Lineage` and `TraverseGraph`; wikilink-style links are not a first-class concept |
| Search-miss analysis (`wicked-brain-dlq`) | No estate equivalent; retire this surface when brain retires |
| Access log (`access_log` action via `npx wicked-brain-call access_log`) | No estate equivalent; `wicked-brain-status` covers stats/search-misses/contradictions, not the access log |
| Brain UI (`wicked-brain-ui`) | No estate equivalent; use the estate MCP inspector directly |

---

## Migration steps (per project)

### 1. Verify estate is running

```bash
# Estate must be running as an MCP server in your agent session config
# Check your claude_desktop_config.json or .claude/settings.json for estate MCP entry
```

### 2. Export brain memories to estate

Brain memories are markdown files stored under `~/.wicked-brain/projects/{project-name}/memory/` (not in `.brain.db` — the SQLite file is a rebuildable search index, not the source of truth for memory content). Back up the `memory/` directory, not the `.brain.db` file.

`wicked-brain-migrate` exists but migrates flat brain layouts to per-project layout — it does not export memories to estate. Until a dedicated estate-export skill ships, export memories via the cross-platform CLI wrapper (auto-discovers the running server and port):

```bash
npx wicked-brain-call recent_memories --param limit=1000
```

Then for each exported memory, call `memory.capture` via the estate MCP server.

### 3. Ingest brain chunks/wiki into estate knowledge

```bash
# Brain chunks live at:
# ~/.wicked-brain/projects/{project-name}/chunks/extracted/
# ~/.wicked-brain/projects/{project-name}/chunks/inferred/
# ~/.wicked-brain/projects/{project-name}/wiki/

# Use knowledge.ingest for each file
```

### 4. Update agent session config

Remove wicked-brain from your MCP server config and skills list. Estate's MCP tools replace the brain server as the memory and knowledge surface.

### 5. Update CLAUDE.md references

Replace `wicked-brain:search` → `SearchEntity` or `knowledge.recall` as appropriate. Replace `wicked-brain:memory` (store mode) → `memory.capture`. Replace `wicked-brain:query` → `knowledge.recall`.

---

## Skill retirement schedule

Brain skills retire in two waves when estate v1.0 ships:

**Wave 1 (immediately replaceable):**
- `wicked-brain-memory` → replaced by `memory.*` tools
- `wicked-brain-query` → replaced by `knowledge.recall`
- `wicked-brain-ingest` → replaced by `knowledge.ingest`
- `wicked-brain-context` → replaced by `ContextBundle`
- `wicked-brain-session-teardown` → replaced by `memory.learn`
- `wicked-brain-consolidate` → replaced by `memory.reflect`

**Wave 2 (needs estate parity verification):**
- `wicked-brain-search` → `SearchEntity` (verify parity on FTS5 vs estate ranking)
- `wicked-brain-read` → `knowledge.recall` (verify wiki-article parity)
- `wicked-brain-onboard` → depends on estate's context-bundle workflow

**Retire-without-replacement (no estate analog):**
- `wicked-brain-dlq`, `wicked-brain-ui`, `wicked-brain-status`
- `wicked-brain-lsp` (LSP stays as standalone tooling if needed)

---

## Reference

- wicked-estate README: `README.md` in the **wicked-estate repository** — full tool catalog, MCP setup, storage paths
- wicked-estate memory tools: `memory.capture`, `memory.recall`, `memory.reflect`, `memory.erase`, `memory.learn`, `memory.coverage`
- wicked-estate knowledge tools: `knowledge.ingest`, `knowledge.write`, `knowledge.relate`, `knowledge.recall`, `knowledge.coverage`, `knowledge.relate_code`, `knowledge.recall_about_code`
- Brain RAID.md RISK-001 — bridge-period obsolescence risk and mitigation
