---
name: wicked-brain:lint
description: |
  Check brain health and fix issues. Dispatches a lint subagent that runs
  deterministic checks (broken links, orphans, stale entries) and semantic
  analysis (inconsistencies, gaps, tag misalignment).
  
  Use when: "lint the brain", "check brain health", "brain lint",
  "find issues in the brain".
---

# wicked-brain:lint

You check brain quality by dispatching a lint subagent.

## Cross-Platform Notes

Commands in this skill work on macOS, Linux, and Windows. When a command has
platform differences, alternatives are shown. Your native tools (Read, Write,
Grep, Glob) work everywhere — prefer them over shell commands when possible.

For the brain path default:
- macOS/Linux: ~/.wicked-brain
- Windows: %USERPROFILE%\.wicked-brain

## Config

Read `_meta/config.json` for brain path and server port.
If it doesn't exist, trigger wicked-brain:init.

## Process

Dispatch a lint subagent with these instructions:

```
You are a quality assurance agent for the digital brain at {brain_path}.
Server: http://localhost:{port}/api

## Pass 1: Deterministic checks

### Broken wikilinks
Find all [[wikilinks]] in wiki and chunk files, check if targets exist.
Use your Grep tool (preferred):
- Pattern: `\[\[[^\]]*\]\]`
- Search in: `{brain_path}/wiki/` and `{brain_path}/chunks/`

Shell fallback:
- macOS/Linux: `grep -roh '\[\[[^]]*\]\]' {brain_path}/wiki/ {brain_path}/chunks/ 2>/dev/null | sort -u`
- Windows: `findstr /s /r "\[\[" "{brain_path}\wiki\*.md" "{brain_path}\chunks\*.md" 2>nul`

For each link, use the Read tool to check if the target file exists.

### Orphan chunks
Use your Glob tool to find all chunk files in `{brain_path}/chunks/**/*.md`.
Then use your Grep tool to check which chunk IDs appear in wiki files.

Shell fallback:
- macOS/Linux:
  ```bash
  find {brain_path}/chunks -name "chunk-*.md" -type f
  grep -rl "chunk-" {brain_path}/wiki/ 2>/dev/null
  ```
- Windows:
  ```powershell
  Get-ChildItem -Recurse -Filter "chunk-*.md" "{brain_path}\chunks"
  findstr /s /m "chunk-" "{brain_path}\wiki\*.md" 2>nul
  ```

### Stale entries
Compare source file modification times with chunk creation times.

### Missing frontmatter
Check each chunk has required frontmatter fields (source, chunk_id, confidence, indexed_at).

## Pass 2: Semantic analysis

Read a sample of chunks and wiki articles. Check:
- Are tags consistent? (same concept tagged differently in different chunks)
- Are there factual contradictions between articles?
- Are there implicit connections that should be explicit [[links]]?
- What topics have chunks but no wiki article? (coverage gaps)

## Report

For each issue found:
- **severity**: error | warning | info
- **type**: broken_link | orphan | stale | missing_field | inconsistency | gap
- **path**: which file
- **message**: what's wrong
- **fix**: suggested fix (or "auto-fixed" if you fixed it)

Auto-fix broken links and missing fields where possible. Report everything else.
```
