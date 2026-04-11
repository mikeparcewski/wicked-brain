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

Resolve the brain config via the shared resolution in
wicked-brain:init § "Resolving the brain config". In short: try
`~/.wicked-brain/projects/{cwd_basename}/_meta/config.json` first, fall back
to `~/.wicked-brain/_meta/config.json` (legacy flat), else trigger
wicked-brain:init. Read the resolved file for brain path and server port.

Do NOT read a bare relative `_meta/config.json` — the model will resolve it
against the current working directory and brain files will end up in the
project root.

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
- Windows (findstr): `findstr /s /r "\[\[" "{brain_path}\wiki\*.md" "{brain_path}\chunks\*.md" 2>nul`
- Windows (PowerShell preferred): `Get-ChildItem -Recurse -Path "{brain_path}\wiki","{brain_path}\chunks" -Filter "*.md" | Select-String -Pattern '\[\[' | Select-Object Path,LineNumber,Line`

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
  findstr /s /r /m "chunk-" "{brain_path}\wiki\*.md" 2>nul
  # PowerShell preferred: Get-ChildItem -Recurse -Path "{brain_path}\wiki" -Filter "*.md" | Select-String -Pattern "chunk-" -List | Select-Object -ExpandProperty Path
  ```

### Stale entries
Compare source file modification times with chunk creation times.

### Stale wiki articles
For each wiki article with source_hashes in frontmatter:
- Read each source chunk
- Compare its current content hash prefix against the stored hash
- If any hash mismatches or chunk is missing: flag as stale

### Missing frontmatter
Check each chunk has required frontmatter fields (source, chunk_id, confidence, indexed_at).

### Tag synonym candidates

Call the server to get all tag frequencies:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"tag_frequency","params":{}}'
```

The response contains `tags: [{tag, count}]`. Identify potential synonyms:

1. **Substring pairs**: if tag A is a substring of tag B (e.g., "auth" is a substring
   of "authentication"), they may be synonyms. Flag pairs where both appear in the brain.

2. **Edit distance ≤ 2**: tags that differ by at most 2 character insertions, deletions,
   or substitutions (e.g., "authentification" vs "authentication") may be typos or synonyms.

For each candidate pair, report as `info` severity with type `synonym_candidate`:
- **path**: `_meta` (brain-level issue, not file-specific)
- **message**: `Possible synonym: "{tagA}" ({countA} uses) and "{tagB}" ({countB} uses) — consider merging`
- **fix**: `Run wicked-brain:retag to consolidate tags`

Only report pairs where both tags have at least 1 use.

### Link confidence report

Call the server for link health:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"link_health","params":{}}'
```

The response contains:
- `broken_links`: count of links whose target is not in the index
- `low_confidence_links`: count of links with confidence < 0.3
- `total_links`: total link count
- `avg_confidence`: average confidence across all links

Report findings:

- If `broken_links > 0`: severity `error`, type `broken_link`:
  `{broken_links} links point to targets not in the index. Use wicked-brain:search to verify targets.`

- If `low_confidence_links > 0`: severity `warning`, type `low_confidence`:
  `{low_confidence_links} links have confidence < 0.3. Use wicked-brain:confirm to evaluate them.`

- Always include summary stats in the report:
  `Total links: {total_links}, avg confidence: {avg_confidence:.2f}`

## Pass 2: Semantic analysis

Read a sample of chunks and wiki articles. Check:
- Are tags consistent? (same concept tagged differently in different chunks)
- Are there factual contradictions between articles?
- Check for `contradicts` typed links — query the server:
  ```bash
  curl -s -X POST http://localhost:{port}/api \
    -H "Content-Type: application/json" \
    -d '{"action":"contradictions","params":{}}'
  ```
  For each contradiction link, read both the source and target to determine
  if the contradiction is resolved. Flag unresolved contradictions as warnings.
- Are there implicit connections that should be explicit [[links]]?
- What topics have chunks but no wiki article? (coverage gaps)

## Report

For each issue found:
- **severity**: error | warning | info
- **type**: broken_link | orphan | stale | missing_field | inconsistency | gap
- **path**: which file
- **message**: what's wrong
- **fix**: suggested fix (or "auto-fixed" if you fixed it)

Auto-fix items include (apply silently, then report as "auto-fixed"):
- Missing frontmatter fields: fill with safe defaults (e.g., `confidence: low`, `indexed_at: now`)
- Orphaned index entries: remove entries from the SQLite index whose source file no longer exists

Manual review required (flag as error or warning — do NOT auto-fix):
- Factual contradictions between articles
- Duplicate content covering the same concept in different files
- Broken wikilinks where the correct target is ambiguous
- Stale wiki articles where the underlying chunk content has changed substantially

Auto-fix broken links and missing fields where possible. Report everything else.
```
