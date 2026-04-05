# wicked-brain Development Guide

## Project Structure

```
wicked-brain/
  server/           # SQLite FTS5 HTTP server (plain JavaScript, one dep)
    bin/             # wicked-brain-server entry point
    lib/             # sqlite-search, wikilinks, file-watcher modules
    test/            # node:test tests
  skills/            # SKILL.md files installed into AI CLIs
    wicked-brain-*/  # One directory per skill
  install.mjs        # CLI installer (detects CLIs, copies skills)
  archive/v1/        # Previous TypeScript implementation (reference only)
  docs/              # Specs and plans
```

## Architecture

Two components:
1. **Server** — Lightweight Node.js HTTP server wrapping SQLite FTS5. Single `POST /api` endpoint with action dispatch. Auto-reindexes on file changes via file watcher.
2. **Skills** — Markdown instruction files (SKILL.md) that teach AI agents how to manage a filesystem-based knowledge base. Installed into Claude Code, Gemini CLI, Copilot CLI, Cursor, Codex.

## Development Rules

### Server (JavaScript)
- Plain JavaScript (ESM). No TypeScript, no build step.
- One runtime dependency: `better-sqlite3`. No others.
- Tests use `node:test` (stdlib). Run: `cd server && node --test`
- All paths must use forward slashes (normalize with `.replace(/\\/g, '/')` on Windows).
- `fs.watch({ recursive: true })` doesn't work on Linux — the file-watcher has a polling fallback.

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
