# wicked-brain Development Guide

## Project Structure

```
wicked-brain/
  server/           # SQLite FTS5 HTTP server with optional LSP client (plain JavaScript)
    bin/             # wicked-brain-server entry point
    lib/             # sqlite-search, wikilinks, file-watcher, lsp-client modules
    test/            # node:test tests
  skills/            # SKILL.md files installed into AI CLIs
    wicked-brain-*/  # One directory per skill
  install.mjs        # CLI installer (detects CLIs, copies skills)
  archive/v1/        # Previous TypeScript implementation (reference only)
  docs/              # Specs and plans
```

## Architecture

Two components:
1. **Server** — Lightweight Node.js HTTP server wrapping SQLite FTS5. Single `POST /api` endpoint with action dispatch. Auto-reindexes on file changes via file watcher. Optional LSP client layer for universal code intelligence.
2. **Skills** — Markdown instruction files (SKILL.md) that teach AI agents how to manage a filesystem-based knowledge base. Installed into Claude Code, Gemini CLI, Copilot CLI, Cursor, Codex.

## Development Rules

### Server (JavaScript)
- Plain JavaScript (ESM). No TypeScript, no build step.
- Minimal runtime dependencies. Core: `better-sqlite3`. LSP layer uses hand-rolled JSON-RPC (zero new deps). Every new dependency needs justification — prefer stdlib and keep the dependency tree shallow.
- Tests use `node:test` (stdlib). Run: `cd server && node --test`
- All paths must use forward slashes (normalize with `.replace(/\\/g, '/')` on Windows).
- `fs.watch({ recursive: true })` doesn't work on Linux — the file-watcher has a polling fallback.
- **Schema migrations required:** Any change to SQLite tables (new columns, new tables, renamed fields) MUST include a numbered migration in the `#migrate()` method of `sqlite-search.mjs`. Never assume `CREATE TABLE IF NOT EXISTS` handles schema evolution — it does not add columns to existing tables. Existing databases must upgrade seamlessly on server restart.

### Skills (Markdown)
- Each skill is a `SKILL.md` with YAML frontmatter (`name`, `description`).
- Skill names use `wicked-brain:` prefix (e.g., `wicked-brain:search`).
- Directory names use `wicked-brain-` prefix (colons aren't valid in dir names).
- Skills must be cross-platform: use agent-native tools (Read, Write, Grep, Glob) over shell commands. When shell is needed, provide macOS/Linux + Windows alternatives.
- Skills include a "Cross-Platform Notes" section.
- `curl` is cross-platform (Windows 10+) — OK to use for server API calls.

### Cross-Platform
- All code and skills must work on macOS, Linux, and Windows.
- No Unix-only shell features without Windows fallback.
- Use `python3 -c "..." 2>/dev/null || python -c "..."` for cross-platform Python.
- Brain path default: `~/.wicked-brain` (macOS/Linux), `%USERPROFILE%\.wicked-brain` (Windows).

### Naming
- Package: `wicked-brain` (skills + installer)
- Server: `wicked-brain-server` (npm package)
- Skills: `wicked-brain:{operation}` (e.g., `wicked-brain:search`)
- Directories: `wicked-brain-{operation}` (e.g., `wicked-brain-search/`)
- Never use the old `fs-brain` or `brain-` names.

## Server API

Single endpoint: `POST http://localhost:{port}/api`

Actions: `health`, `search`, `federated_search`, `index`, `remove`, `reindex`, `backlinks`, `forward_links`, `stats`

## Testing

```bash
cd server && node --test          # Run all server tests
cd server && node --test test/sqlite-search.test.mjs  # Run one test file
```

No test framework dependencies. Uses `node:test` and `node:assert/strict`.

## Releasing

Releases are fully automated via GitHub Actions (`.github/workflows/release.yml`). **Never run `npm publish` locally.**

To release:
1. Commit and push your changes to `main`
2. Tag and push: `git tag vX.Y.Z && git push --tags`

The pipeline triggers on `v*` tags and:
- Runs tests on ubuntu, macos, and windows
- Publishes to npm (with provenance)
- Publishes to GitHub Packages
- Creates a GitHub Release with auto-generated notes

The `package.json` version does not need to be updated manually — the pipeline sets it from the tag.

## Brain Directory Structure

```
~/.wicked-brain/
  brain.json              # Identity and brain links
  raw/                    # Source files
  chunks/extracted/       # Source-faithful extractions
  chunks/inferred/        # LLM-generated content
  wiki/                   # Synthesized articles
  _meta/log.jsonl         # Event log
  _meta/config.json       # Server port, brain path
  _meta/server.pid        # Running server PID
  .brain.db               # SQLite index (rebuildable)
```
