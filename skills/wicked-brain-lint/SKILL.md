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
Find all [[wikilinks]] in wiki and chunk files, check if targets exist:
```bash
grep -roh '\[\[[^]]*\]\]' {brain_path}/wiki/ {brain_path}/chunks/ 2>/dev/null | sort -u
```
For each link, check if the target file exists.

### Orphan chunks
Find chunks not referenced by any wiki article:
```bash
# Get all chunk IDs
find {brain_path}/chunks -name "chunk-*.md" -type f
# Check which are referenced in wiki
grep -rl "chunk-" {brain_path}/wiki/ 2>/dev/null
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
