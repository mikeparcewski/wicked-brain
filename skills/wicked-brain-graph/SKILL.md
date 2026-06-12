---
name: wicked-brain:graph
description: |
  Code-relationship graph queries — blast radius, callers, and lineage — backed
  by a codegraph static graph the brain owns. Answers "what breaks if I change X",
  "who calls X", and "what does X depend on" across the whole repo, including
  relationships a grep or single-file LSP lookup cannot see.

  Use when: "blast radius", "what breaks if I change", "impact of changing X",
  "who depends on X", "what depends on X", "lineage", "what does X depend on",
  "architecture map", "code relationship graph".
---

# wicked-brain:graph

Relationship-graph intelligence over a codegraph-built SQLite graph. Distinct from
`wicked-brain:lsp` (live, single-symbol definitions / references / hover /
diagnostics) — this is the whole-repo relationship graph and the home of
blast-radius / lineage.

## Cross-Platform Notes

This skill uses `npx wicked-brain-call` for all server interaction. The CLI works
on macOS, Linux, and Windows; it discovers the brain, auto-starts the server, and
writes a per-call audit record under `{brain}/calls/`.

## Queries

- `graph-index` — build/refresh the graph (`codegraph init`/`index`). Run once per
  repo, then on demand when a result reports it is stale.
- `graph-blast-radius {node}` — transitive **dependents** of `node` ("what breaks
  if I change it").
- `graph-callers {node}` — direct dependents only (depth 1).
- `graph-lineage {node}` — transitive **dependencies** (what `node` depends on,
  downstream).

`node` ids follow codegraph's convention — e.g. `file:src/app.py`, or a symbol id
like `function:<hash>` (use `qualified_name` from a search/symbols lookup to find
the id). Every result carries a `staleness` stamp (`commits_behind`, `indexed_at`);
when `stale` is true, re-run `graph-index`.

## Freshness

Lazy by design — the graph is **never** auto-rebuilt by a file watcher (that path
is a known CPU-runaway hazard). Results tell you when they are behind HEAD; rebuild
explicitly with `graph-index` (or wire the optional commit hook). If codegraph is
not installed, queries return `engine: "unavailable"` rather than a misleading
empty graph.

## Engine

Backed by the `@colbymchenry/codegraph` CLI (resolved at runtime via
`WICKED_CODEGRAPH_BIN` → brain config → PATH → `npx`). The brain reads codegraph's
SQLite graph directly; it shells the CLI only to (re)build.

### Offline / air-gapped install

By **default** the engine is resolved by shelling out to
`npx @colbymchenry/codegraph`, which **downloads from the npm registry and will
not work on an air-gapped machine**. To run offline, install the CLI ahead of
time and point the brain at the binary with **`WICKED_CODEGRAPH_BIN`** — the
**highest-priority** entry in the resolution ladder:

```
WICKED_CODEGRAPH_BIN  →  _meta/codegraph.json {bin}  →  PATH  →  source node_modules/.bin/codegraph  →  npx (network, last resort)
```

```bash
# Pre-install on a connected machine, then on the air-gapped host:
export WICKED_CODEGRAPH_BIN=/usr/local/bin/codegraph     # macOS/Linux
```
```powershell
$env:WICKED_CODEGRAPH_BIN = "C:\tools\codegraph\codegraph.cmd"   # Windows
```

- A `.mjs`/`.js` target is invoked via `node`; any other path is executed directly.
- An **empty** `WICKED_CODEGRAPH_BIN` is a **kill switch** — queries return
  `engine: "unavailable"` rather than reaching for the network `npx` path.
- Per-brain alternative: write `_meta/codegraph.json` with `{ "bin": "/path/to/codegraph" }`.
