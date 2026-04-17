# onboard

## Depth 0 — Summary
Full project understanding pipeline. Scans project, extracts findings from 5 perspectives (product, engineering, quality, ops, data), ingests as structured chunks, compiles a progressive-loading support wiki, and configures the CLI.

## Depth 1 — Pipeline Steps
0. Detect: run `wicked-brain-onboard-wiki` to classify repo mode, write `.wicked-brain/mode.json`, and stamp the contributor-wiki pointer into CLAUDE.md / AGENTS.md if present
1. Scan: directory structure, key files, languages, frameworks, dependencies
2. Investigate: gather facts from each of the 5 perspectives
3. Extract symbols: LSP workspace symbols or grep fallback (JS/TS)
4. Ingest: write 6 perspective-based chunks with support-wiki frontmatter
5. Compile: produce 5 depth-aware wiki articles under wiki/projects/{name}/
6. Configure: call wicked-brain:configure to update CLI agent config

Parameters: brain_path, port, project_path (defaults to cwd)
Depends on: wicked-brain:ingest, wicked-brain:compile, wicked-brain:configure

## Depth 2 — Full Subagent Instructions

You are an onboarding agent for the digital brain at {brain_path}.
Server: http://localhost:{port}/api
Project: {project_path}

Your job: deeply understand a project from 5 perspectives and produce a support wiki that serves engineers, testers, ops, and product owners — all through progressive loading so only what's needed gets loaded.

### Step 0: Detect repo mode and stamp wiki pointer

Before scanning, classify the repo and establish the contributor-wiki location.
This runs the `wicked-brain-onboard-wiki` CLI (bundled with `wicked-brain-server`),
which:

- Runs mode detection (code / content / mixed / unknown).
- Writes `.wicked-brain/mode.json` unless an `override:true` file is already there.
- Stamps `Contributor wiki: ./<path>` into `CLAUDE.md` and/or `AGENTS.md` if either exists.

```bash
npx wicked-brain-onboard-wiki --repo-root "{project_path}" 2>&1 || \
  node "{wicked_brain_install}/server/bin/onboard-wiki.mjs" --repo-root "{project_path}"
```

Capture the output — the reported mode drives how Step 2 interprets the 5
perspectives (content-mode repos put more weight on product/data, less on
engineering specifics). If the file reports `override:true`, respect it and
report the preserved mode rather than forcing a rewrite.

If neither `CLAUDE.md` nor `AGENTS.md` exists, the CLI reports `absent` for
both — surface that in the summary so the user can decide whether to create
one. Do NOT create either file yourself unless the user asks.

### Step 1: Scan project structure

Use Glob and Read tools to survey:
- Root files: package.json, pyproject.toml, Cargo.toml, go.mod, Makefile, Dockerfile, etc.
- Directory structure: `ls` the top-level and key subdirectories
- Languages: identify primary and secondary languages from file extensions
- Frameworks: identify from dependency files and imports
- Config files: .env.example, CI/CD configs, deployment manifests

Create a structured summary of what you found.

### Step 2: Investigate from 5 perspectives

Gather facts for each perspective. You'll write these as chunks in Step 4.

#### Product perspective
- What does this project do? Who is it for?
- Feature catalog: list every user-facing capability (CLI commands, API endpoints, skills, UI features)
- Capabilities with examples: how to exercise each feature
- Limitations: what it explicitly doesn't do, scale boundaries, known gaps
- Version history: recent git tags and what shipped (use `git tag --sort=-v:refname | head -10` and `git log --oneline {tag}..{next_tag}`)

#### Engineering perspective
- Architecture: components and how they connect
- Dependencies: runtime, build, optional — with why each exists
- Entry and exit points (broader than APIs):
  - HTTP endpoints, CLI commands/flags
  - File system triggers (watchers, config file conventions)
  - Events (bus, pub/sub, webhooks)
  - Signals (process signals, IPC, PID files)
- Module map: which file owns what responsibility
- Data flow: request lifecycle from entry to storage to response
- Extension points: where to add new functionality (new action, new migration, new skill)

#### Quality perspective
- Test infrastructure: framework, runner command, test file locations
- Test coverage: what's tested, what's manual-only
- Functional capabilities: every feature × how to verify it works
- Regression requirements: what MUST pass before a release
- Edge cases: what breaks at boundaries (empty state, concurrent access, missing deps)

#### Operations perspective
- Configuration: all config files, env vars, CLI flags with defaults
- Startup/shutdown: how the system starts, process management
- Health checks: what endpoints exist, what "healthy" looks like
- Troubleshooting: common failure modes with symptom → diagnosis → fix
- Upgrade path: how to update, what migrates automatically
- Backup/recovery: what's rebuildable vs precious

#### Data perspective
- Sources: what data enters the system (files, API input, events)
- Storage: where data lives on disk, what format
- Schema: database tables, columns, indexes (if applicable)
- Constraints: size limits, format requirements, naming conventions
- Data lifecycle: creation → access → decay → archive → deletion
- Integrity: what's rebuildable vs authoritative, dedup mechanisms

### Step 3: Extract symbols (JS/TS projects)

If the brain server has an LSP running, query it for exported symbols:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"lsp-workspace-symbols","params":{"query":""}}'
```

If LSP is unavailable (check `{"action":"lsp-health"}`), fall back to reading
key source files directly and listing their exports with Grep:
- `export function`, `export class`, `export const`, `export default`
- `module.exports`, `exports.`

For each major module/directory, record:
- **File inventory**: files with approximate LOC
- **Exported symbols**: class names, function names, const names with their file paths
- **Signatures**: parameter types and return types when visible

Be specific — write `search({ query, limit, offset, since, session_id })` not
"searches the index". Include types when visible.

### Step 4: Ingest findings

Write chunks to `{brain_path}/chunks/extracted/project-{safe_project_name}/`:

- `chunk-product.md` — product perspective (from Step 2)
- `chunk-engineering.md` — engineering perspective (from Step 2)
- `chunk-quality.md` — quality perspective (from Step 2)
- `chunk-operations.md` — operations perspective (from Step 2)
- `chunk-data.md` — data perspective (from Step 2)
- `chunk-symbols.md` — exported symbols per module (from Step 3)

#### Chunk frontmatter

Each chunk MUST include `type: support-wiki` and `perspective:` so compile routes
them correctly:

```yaml
---
type: support-wiki
perspective: engineering
authored_by: onboard
authored_at: {ISO timestamp}
contains:
  - {synonym-expanded tags}
---
```

#### chunk-symbols.md format

List symbols grouped by module/directory:

```markdown
## server/lib/

### sqlite-search.mjs (878 LOC)
- `class SqliteSearch` — FTS5 search engine wrapping better-sqlite3
  - `search({ query, limit, offset, since, session_id })` → `{ results, total_matches, showing }`
  - `wikiList({ query, limit })` → `{ articles: [{ path, title, description, tags, word_count }] }`
  - `index(doc)` — upsert document + FTS + wikilinks
  - `stats()` → `{ total, chunks, wiki, memory, ... }`
- `function deriveSourceType(path)` → `"wiki" | "memory" | "chunk"`

### file-watcher.mjs (330 LOC)
- `class FileWatcher` — recursive fs.watch with polling fallback
  - `start()` / `stop()` — lifecycle
  - `onFileChange(callback)` — hook for LSP integration
```

Use standard chunk frontmatter with rich synonym-expanded `contains:` tags.

If re-onboarding (chunks already exist), follow the archive-then-replace pattern:
1. Remove old chunks from index via server API
2. Archive old chunk directory with `.archived-{timestamp}` suffix
3. Write new chunks

### Step 5: Compile support wiki

Create 5 wiki articles under `{brain_path}/wiki/projects/{safe_project_name}/`:

- `product.md` — from chunk-product
- `engineering.md` — from chunk-engineering + chunk-symbols
- `quality.md` — from chunk-quality
- `operations.md` — from chunk-operations
- `data.md` — from chunk-data

#### Wiki article format

Each article must have structured frontmatter for progressive loading:

```yaml
---
title: {Perspective}
type: support-wiki
perspective: {perspective}
project: {project-name}
authored_by: onboard
authored_at: {ISO timestamp}
stats:
  {perspective-specific numeric summary}
sections:
  - name: {Section Name}
    line: {line number}
    summary: "{one-line summary}"
contains:
  - {tags}
---
```

The `stats` block enables depth-0 retrieval (~5 tokens per article).
The `sections` block enables depth-1 retrieval (~50-100 tokens).
The body is depth-2 (full content, loaded on demand).

**Key rule for body structure:** the first paragraph under each `##` heading
must be a self-contained summary of that section. This is what `brain:read`
returns at depth 1. Put detail after the first paragraph.

#### What each article should answer

| Article | Depth 0 answers | Depth 1 answers | Depth 2 answers |
|---------|-----------------|-----------------|-----------------|
| product.md | "How many features?" | "What are the features?" | "How do I use each one? What are the limits?" |
| engineering.md | "How many modules/deps?" | "What are the components and how do they connect?" | "What symbols does module X export? How do I extend it?" |
| quality.md | "What's the test coverage?" | "What capabilities need testing?" | "How do I verify capability X works? What are the edge cases?" |
| operations.md | "How many config files?" | "What can go wrong?" | "How do I fix X? Full troubleshooting playbook." |
| data.md | "What data sources?" | "What's the schema?" | "What are the constraints? How does the lifecycle work?" |

Include `[[wikilinks]]` between articles where relevant (e.g., engineering.md
links to data.md for schema details, quality.md links to product.md for the
feature list it verifies).

### Step 6: Configure

Invoke `wicked-brain:configure` to update the CLI's agent config file with brain-aware instructions.

### Summary

Report what was onboarded:
- Project: {name}
- Chunks created: {N} (6 perspective-based)
- Wiki articles: {list of 5 articles}
- CLI config updated: {file}
