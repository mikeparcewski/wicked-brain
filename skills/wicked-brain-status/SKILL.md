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

If connection refused, start the server (see wicked-brain:server skill), then retry.

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
- List the top 10 most common tags
- Flag any staleness warnings (sources modified after last ingest)

**Depth 2:**
Depth 1 plus:
- Read `_meta/log.jsonl` fully for recent activity (last 7 days)
- List coverage gaps (chunks with no wiki article referencing them)
- Full linked brain details
