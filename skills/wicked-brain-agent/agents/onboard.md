# onboard

## Depth 0 — Summary
Full project understanding pipeline. Scans project structure, traces architecture, extracts conventions, ingests findings into the brain, compiles a project map wiki article, and runs configure.

## Depth 1 — Pipeline Steps
1. Scan: directory structure, key files, languages, frameworks, dependencies
2. Trace: entry points, data flow, module boundaries, API surfaces
3. Extract: naming patterns, test patterns, build/deploy patterns, code style
4. Ingest: store findings as extracted chunks with synonym-expanded tags
5. Compile: synthesize a wiki article summarizing architecture and conventions
6. Configure: call wicked-brain:configure to update CLI agent config

Parameters: brain_path, port, project_path (defaults to cwd)
Depends on: wicked-brain:ingest, wicked-brain:compile, wicked-brain:configure

## Depth 2 — Full Subagent Instructions

You are an onboarding agent for the digital brain at {brain_path}.
Server: http://localhost:{port}/api
Project: {project_path}

Your job: deeply understand a project and ingest that understanding into the brain.

### Step 1: Scan project structure

Use Glob and Read tools to survey:
- Root files: package.json, pyproject.toml, Cargo.toml, go.mod, Makefile, Dockerfile, etc.
- Directory structure: `ls` the top-level and key subdirectories
- Languages: identify primary and secondary languages from file extensions
- Frameworks: identify from dependency files and imports
- Config files: .env.example, CI/CD configs, deployment manifests

Create a structured summary of what you found.

### Step 2: Trace architecture

- Identify entry points (main files, server start, CLI entry)
- Map module boundaries (directories, packages, namespaces)
- Identify API surfaces (HTTP routes, CLI commands, exported functions)
- Trace primary data flows (request → handler → storage → response)
- Note external dependencies and integrations

#### Step 2b: Extract symbols (JS/TS projects)

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
- **Public API surface**: which symbols are entry points vs internal helpers

Be specific — write `analyzeProject(desc: string): SignalAnalysis` not just
"analyzes projects". Include parameter types and return types when visible.

### Step 3: Extract conventions

- **Naming**: file naming, function naming, variable naming patterns
- **Testing**: test framework, test file locations, test naming patterns
- **Build/Deploy**: build commands, deploy scripts, CI/CD patterns
- **Code style**: formatting, import ordering, comment conventions

### Step 4: Ingest findings

For each major finding (architecture, conventions, dependencies), write a chunk to `{brain_path}/chunks/extracted/project-{safe_project_name}/`:

Each chunk should be a focused topic:
- `chunk-001-structure.md` — project structure and layout (directory tree with file counts and LOC)
- `chunk-002-architecture.md` — architecture and data flow
- `chunk-003-conventions.md` — coding conventions and patterns
- `chunk-004-dependencies.md` — key dependencies and integrations
- `chunk-005-build-deploy.md` — build, test, and deployment
- `chunk-006-symbols.md` — exported symbols per module (from Step 2b)

**chunk-006-symbols.md format:** List symbols grouped by module/directory. For each
symbol include: name, kind (class/function/const/interface), file path, and signature
when available. Example:

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

This gives compile enough structural detail to weave into wiki articles.

Use standard chunk frontmatter with rich synonym-expanded `contains:` tags.

If re-onboarding (chunks already exist), follow the archive-then-replace pattern:
1. Remove old chunks from index via server API
2. Archive old chunk directory with `.archived-{timestamp}` suffix
3. Write new chunks

### Step 5: Compile project map

Invoke `wicked-brain:compile` (or write directly) to create a wiki article at `{brain_path}/wiki/projects/{safe_project_name}.md` that synthesizes:
- Project overview (what it does, who it's for)
- Architecture summary with module map
- **API surface** — key exported symbols per module (from chunk-006-symbols), with signatures
- **File inventory** — directories with file counts and total LOC
- Key conventions
- Build/test/deploy quickstart
- Links to detailed chunks via [[wikilinks]]

The wiki article should answer both "how does X work?" (narrative) and "what does X export?" (structural). Include actual function names, class names, and signatures — not just descriptions.

### Step 6: Configure

Invoke `wicked-brain:configure` to update the CLI's agent config file with brain-aware instructions.

### Summary

Report what was onboarded:
- Project: {name}
- Chunks created: {N}
- Wiki article: {path}
- CLI config updated: {file}
