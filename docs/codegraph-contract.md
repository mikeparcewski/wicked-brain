# codegraph contract

Empirical characterization of `@colbymchenry/codegraph` schema and behaviour.
Produced by a spike run on 2026-06-10. Downstream tasks MUST cite this document
for schema column names and the `DEPENDENTS_BY` constant — do not assume.

---

## Version

```
$ npx -y @colbymchenry/codegraph --version
0.9.9
```

---

## Index command contract

The CLI requires **`init`** for a first-time run (creates `.codegraph/` and
builds the full index in one step). Subsequent re-indexes use `index`.

```
# First time on a repo (creates .codegraph/codegraph.db + indexes)
npx -y @colbymchenry/codegraph init [path]

# Re-index after changes
npx -y @colbymchenry/codegraph index [path]
npx -y @colbymchenry/codegraph index --force [path]   # force full re-index
npx -y @colbymchenry/codegraph index --quiet  [path]  # suppress progress
```

`[path]` is optional — defaults to cwd. Both commands accept an explicit
directory as a positional argument.

**`index` on a repo that has not been `init`-ed will fail** because
`.codegraph/codegraph.db` does not yet exist. The correct bootstrap sequence
is always `init` first, then `index` for subsequent updates. (Attempting to
call `index` on a fresh directory raises an error; `init` is the entry point.)

### `init` output (actual, from spike)

```
┌  Initializing CodeGraph
│
◆  Initialized in /private/tmp/cg-spike
│
│  · Scanning files...
│  ◆ Scanning files — 2 found
│  · Parsing code  ░░░░░░░░░░░░░░░░░░░░░░░░░  0%
│  ◆ Parsing code — done
│  ◆ Resolving refs — done
│
◆  Indexed 2 files
│
●  5 nodes, 5 edges in 184ms
│
└  Done
```

---

## `nodes` table

### Full schema (from `.schema nodes`)

```sql
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    docstring TEXT,
    signature TEXT,
    visibility TEXT,
    is_exported INTEGER DEFAULT 0,
    is_async INTEGER DEFAULT 0,
    is_static INTEGER DEFAULT 0,
    is_abstract INTEGER DEFAULT 0,
    decorators TEXT,           -- JSON array
    type_parameters TEXT,      -- JSON array
    updated_at INTEGER NOT NULL
);
```

### Column list (ordered)

`id`, `kind`, `name`, `qualified_name`, `file_path`, `language`,
`start_line`, `end_line`, `start_column`, `end_column`,
`docstring`, `signature`, `visibility`,
`is_exported`, `is_async`, `is_static`, `is_abstract`,
`decorators`, `type_parameters`, `updated_at`

### Node id format

Node ids use `<kind>:<hash_or_relpath>` format:
- **file nodes**: `file:<relpath>` — e.g., `file:a.py`, `file:b.py`
- **function nodes**: `function:<md5-ish-hash>` — e.g., `function:cf8a577152c7b744850fea3476634811`
- **import nodes**: `import:<hash>` — e.g., `import:87573e212582ddea370092f138bb269e`

### Actual node rows from spike (2-file fixture: a.py + b.py)

```
id                                            | kind     | name    | qualified_name | file_path
----------------------------------------------|----------|---------|---------------|----------
file:a.py                                     | file     | a.py    | a.py           | a.py
function:cf8a577152c7b744850fea3476634811      | function | base    | base           | a.py
file:b.py                                     | file     | b.py    | b.py           | b.py
import:87573e212582ddea370092f138bb269e        | import   | a       | a              | b.py
function:4d743eac618702bb486052d27f77ddc6      | function | caller  | caller         | b.py
```

Fixture source:
- `a.py`: `def base(): pass`
- `b.py`: `from a import base` / `def caller(): return base()`

---

## `edges` table

### Full schema (from `.schema edges`)

```sql
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL,
    metadata TEXT,   -- JSON object
    line INTEGER,
    col INTEGER,
    provenance TEXT DEFAULT NULL,
    FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);
```

### Column list (ordered)

`id`, `source`, `target`, `kind`, `metadata`, `line`, `col`, `provenance`

### Observed edge kinds

| kind       | meaning                                    |
|------------|--------------------------------------------|
| `contains` | parent node contains child node            |
| `imports`  | file imports an import-node                |
| `calls`    | function/method calls another symbol       |

### Actual edge rows from spike

```
id | source                                        | target                                        | kind     | metadata
---|-----------------------------------------------|-----------------------------------------------|----------|--------------------------------------------------
1  | file:a.py                                     | function:cf8a577...                           | contains |
2  | file:b.py                                     | import:87573e21...                            | contains |
3  | file:b.py                                     | function:4d743e...                            | contains |
4  | file:b.py                                     | import:87573e21...                            | imports  | {"confidence":0.9,"resolvedBy":"exact-match"}
5  | function:4d743eac618702bb486052d27f77ddc6      | function:cf8a577152c7b744850fea3476634811      | calls    | {"confidence":0.9,"resolvedBy":"exact-match"}
```

Full output of `SELECT source,target,kind,metadata FROM edges;`:

```
file:a.py|function:cf8a577152c7b744850fea3476634811|contains|
file:b.py|import:87573e212582ddea370092f138bb269e|contains|
file:b.py|function:4d743eac618702bb486052d27f77ddc6|contains|
file:b.py|import:87573e212582ddea370092f138bb269e|imports|{"confidence":0.9,"resolvedBy":"exact-match"}
function:4d743eac618702bb486052d27f77ddc6|function:cf8a577152c7b744850fea3476634811|calls|{"confidence":0.9,"resolvedBy":"exact-match"}
```

---

## DEPENDENTS_BY — resolved blast-radius edge direction

```
DEPENDENTS_BY = "target"
```

### Evidence

The fixture establishes a clear caller→callee relationship:
- `b.py::caller` calls `a.py::base`
- `caller` is the **dependent** (it breaks if `base` changes)
- `base` is the **dependency** (the thing being changed)

The observed `calls` edge row is:

```
source = function:4d743eac618702bb486052d27f77ddc6   ← caller  (b.py, the dependent)
target = function:cf8a577152c7b744850fea3476634811   ← base    (a.py, the dependency)
kind   = calls
```

**Edge direction: `source=consumer/dependent → target=producer/dependency`**

To answer "what depends on X?" (blast radius of X — what breaks if X changes):

```sql
SELECT source FROM edges WHERE target = :x_id AND kind IN ('calls', 'imports', 'references');
```

This matches rows WHERE `target = X`, collecting `source` — hence `DEPENDENTS_BY = "target"`.

### Resolution of the inject_edges.py ambiguity

The wicked-garden reference implementation (`scripts/codegraph/inject_edges.py`)
had a contradictory comment: it said blast-radius "walks incoming edges" but
inserted producer→consumer edges. This spike resolves the ambiguity: edges are
stored **consumer→producer** (`source=dependent, target=dependency`), so
dependents-of-X are found by `WHERE target=X` (i.e., "incoming to X"). The
comment in inject_edges.py was **correct** ("walks incoming edges"); the
characterization of the insert direction was confusing but ultimately consistent
with the observed data.

---

## Import edge nuance

The `imports` edge does **not** point directly from `file:b.py` to `file:a.py`.
Instead, codegraph creates an intermediate `import` kind node:

```
file:b.py  --[imports]--> import:<hash>  (name="a", file_path="b.py")
```

The import node has `name = "a"` (the module name, not the file path). The
`import` node itself does NOT have a resolved edge to `file:a.py` in this
fixture — the `imports` edge goes file→import-node, not file→file. For
file-level blast-radius traversal, resolving `import` nodes to their target
`file` nodes requires matching the import node's `name` against file node
`name` values (or `file_path`).

The `calls` edge, by contrast, is fully resolved: it points directly from
`function:<hash>` to `function:<hash>`, crossing the file boundary.

---

## Schema versions (from `schema_versions` table)

```
version | description
--------|------------------------------------------
1       | Initial schema
4       | Initial schema includes all migrations
```

DB is at version 4 with codegraph 0.9.9.

---

## Additional tables

Beyond `nodes` and `edges`, the DB contains:

| table              | purpose                                        |
|--------------------|------------------------------------------------|
| `files`            | per-file index metadata (hash, language, size) |
| `unresolved_refs`  | references codegraph could not resolve         |
| `project_metadata` | key/value store for project-level metadata     |
| `schema_versions`  | migration history                              |
| `nodes_fts`        | FTS5 virtual table over nodes (name, docstring)|

---

## Surprises

1. **`init` is required first, not `index`.** The task description suggested
   `npx -y @colbymchenry/codegraph index .` but that requires a pre-existing
   `.codegraph/` directory. For a fresh repo, `init` is the correct entry point.
   `init` both initializes and indexes in one step. `index --help` confirms it
   only re-indexes; `init --help` confirms it is the bootstrap command.

2. **Import edges use intermediate import nodes**, not direct file→file edges.
   The `imports` edge goes `file:b.py → import:<hash>` where the import node
   has `name="a"` (the Python module name). Resolution to `file:a.py` requires
   a second lookup step.

3. **Node ids use content-hash suffixes** for non-file nodes. The `id` for a
   function is `function:<md5-style-hash>` — not `file:relpath::symbol_name`.
   `qualified_name` (e.g., `"base"`, `"caller"`) is the human-readable key for
   symbol lookups.

4. **`metadata` column is JSON**, not split into separate columns.
   Resolved edges carry `{"confidence": 0.9, "resolvedBy": "exact-match"}`.

5. **`col` in edges is 0-indexed byte offset**, not 1-indexed column.
   The `calls` edge shows `col=21` which is the byte offset of `base()` in
   `def caller(): return base()`.
