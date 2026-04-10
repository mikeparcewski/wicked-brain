---
name: wicked-brain:status
description: |
  Show brain health, stats, and orientation with progressive loading.
  Depth 0: summary. Depth 1: + topic distribution. Depth 2: full orientation.
  
  Use when: "brain status", "what's in my brain", "brain health", or when
  orienting at the start of a session.
---

# wicked-brain:status

You report the brain's current state using progressive loading.

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

## Parameters

- **depth** (default: 0): how much to return

## Process

### Step 1: Read brain.json

Use the Read tool on `{brain_path}/brain.json` to get id, name, parents, links.

### Step 2: Get server stats

Ensure the server is running (use the wicked-brain:server auto-start pattern):
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"stats","params":{}}'
```

If connection refused, invoke the `wicked-brain:server` skill to start the server, then retry.

### Step 3: Return at requested depth

**Depth 0:**
```
Brain: {name} ({id})
Chunks: {total_chunks} | Wiki articles: {total_wiki_articles}
Last indexed: {last_indexed}
Linked brains: {list of parents and links with accessible/inaccessible status}
```

Check parent/link accessibility by using the Read tool on
`{brain_path}/{relative_link_path}/brain.json`. Shell fallback:
- macOS/Linux: `cat {brain_path}/{relative_link_path}/brain.json 2>/dev/null`
- Windows: `Get-Content "{brain_path}\{relative_link_path}\brain.json" 2>nul`

**Depth 1:**
Depth 0 plus:
- Use the Read tool on `_meta/log.jsonl` (last 50 lines) to identify topic distribution from recent tag events.
  Shell fallback: `tail -50 {brain_path}/_meta/log.jsonl` (macOS/Linux) or `Get-Content "{brain_path}\_meta\log.jsonl" -Tail 50` (Windows PowerShell)
- Show topic distribution for the last 7 days by searching with a `since` filter.
  The `since` value must be ISO 8601 format (e.g., `2025-01-15T00:00:00Z`):
  ```bash
  curl -s -X POST http://localhost:{port}/api \
    -H "Content-Type: application/json" \
    -d '{"action":"search","params":{"query":"*","limit":100,"since":"{iso8601_7_days_ago}"}}'
  ```
  Group results by path prefix (e.g., `chunks/extracted/`, `wiki/`) to show recent activity distribution.
- List the top 10 most common tags
- Flag any staleness warnings (sources modified after last ingest)

**Convergence Debt:**
Detect chunks that are frequently accessed but have never been compiled into wiki articles:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"candidates","params":{"mode":"promote","limit":50}}'
```

For each result where `access_count >= 5` and `session_diversity >= 3`, check whether any wiki article references it. Use the Grep tool on `{brain_path}/wiki/` searching for the chunk path string. If no wiki article references it, flag it as convergence debt:

```
⚠ Convergence debt: {path} (accessed {access_count} times across {session_diversity} sessions, no wiki citation)
```

If any convergence debt exists, suggest running `wicked-brain:compile` to promote high-value chunks.

**Contradiction Hotspots:**
Detect path prefixes that concentrate multiple contradictions:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"contradictions","params":{}}'
```

Group the returned contradiction links by path prefix: take the first two path segments of each linked path (e.g., a path `chunks/extracted/auth/session.md` yields prefix `chunks/extracted/auth/`). If any prefix has 2 or more contradiction links, flag it as a hotspot:

```
⚠ Contradiction hotspot: {prefix} ({N} contradictions) — consider dispatching wicked-brain:compile or manual review
```

**Depth 2:**
Depth 1 plus:
- Read `_meta/log.jsonl` fully for recent activity (last 7 days)
- List coverage gaps (chunks with no wiki article referencing them)
- Full linked brain details

**Link Health (Depth 2 only):**
Check link integrity and surface knowledge gaps using two additional API calls.

Get link health:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"link_health","params":{}}'
```

Report:
- Total links checked and number of broken links
- Links with confidence below 0.5 (low confidence links)
- Average confidence score across all links

Get recent search misses:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"search_misses","params":{"limit":20}}'
```

Report the top recurring search miss queries to identify knowledge gaps. If a query appears multiple times, that topic is a strong candidate for ingestion or wiki article creation.
