---
name: wicked-brain:search
description: |
  Search the digital brain for relevant content. Dispatches parallel search
  subagents across local and linked brains. Returns results at depth 0 with
  deeper hints.
  
  Use when: "search brain for", "find in brain", "brain search", or when
  looking for specific content across the knowledge base.
---

# wicked-brain:search

You search the digital brain by dispatching parallel subagents — one per brain
in the network (local + parents + links).

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

- **query** (required): what to search for
- **limit** (default: 10): max results per brain
- **depth** (default: 0): result detail level

## Process

### Step 1: Discover brains to search

Use the Read tool on `{brain_path}/brain.json` to get parents and links.
For each parent/link, check if it's accessible by reading `{brain_path}/{relative_path}/brain.json`.

Build a list of accessible brains with their absolute paths.

### Step 2: Ensure server is running

```bash
curl -s -f -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"health","params":{}}'
```

If connection refused, trigger wicked-brain:server auto-start pattern.

### Step 3: Dispatch search subagents in parallel

Launch one subagent per accessible brain using parallel dispatch:

- **Claude Code:** use the Agent tool, launching all subagents in a single message so they run concurrently.
- **Other CLIs with subagent support:** use the CLI's native parallel dispatch mechanism (e.g., Gemini CLI's parallel tool calls).
- **No subagent support:** run each brain search sequentially and collect results before merging.

Each subagent call passes the brain-specific instructions below.

Each search subagent receives these instructions:

```
You are a search agent for the "{brain_id}" brain at {brain_path}.

Search for: "{query}"

## Step 1: Server search (FTS5)

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"search","params":{"query":"{query}","limit":{limit}}}'
```

Parse the JSON response to get results.

## Step 2: Return results

For each result, read the first line of the file to get the title/summary.

Return in this format:
BRAIN: {brain_id}
RESULTS:
- {path} | score: {score} | {one-line summary}
- {path} | score: {score} | {one-line summary}
TOTAL: {count}
```

### Step 3: Merge results from all subagents

After all subagents return:
1. Collect all results
2. Deduplicate by path (keep higher score)
3. Sort by score descending
4. Tag each result with its brain origin

### Step 4: Return at requested depth

**Depth 0 (default):**
```
Found {N} matches across {M} brains (showing top {limit}):

1. {path} [{brain}] ({score})
   {one-line summary}

2. {path} [{brain}] ({score})
   {one-line summary}

...

Unreachable brains: {list, if any}

To read any result: wicked-brain:read {path} --depth 2
```

**Depth 1:** For each result, also include frontmatter + first paragraph.
**Depth 2:** For each result, include full content (use sparingly — high token cost).
