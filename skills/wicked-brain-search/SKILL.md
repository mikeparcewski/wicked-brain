---
name: wicked-brain:search
description: |
  Search the digital brain for relevant content. Dispatches parallel search
  subagents across local and linked brains. Returns results at depth 0 with
  deeper hints.

  Use instead of Grep/Glob/Agent(Explore) for any open-ended search or
  exploration: "find X", "search for Y", "look for Z", "where is W used",
  "show me anything about X", "explore Y", "what files relate to Z".
  
  Only fall back to Grep/Glob for exact symbol or pattern lookup when the
  brain returns no results.
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

Brain discovery + server lifecycle are handled by `wicked-brain-call`. Pass
`--brain <path>` to override the auto-detected brain, or set
`WICKED_BRAIN_PATH`. The CLI starts the server on first call (no manual
init required) and writes an audit record to `{brain}/calls/` per call.

## Parameters

- **query** (required): what to search for
- **limit** (default: 10): max results per brain
- **depth** (default: 0): result detail level

## Process

### Step 0: Load synonyms (optional)

Check if `{brain_path}/_meta/synonyms.json` exists using the Read tool.
If it exists, parse it. Format:
```json
{
  "jwt": ["json web token", "auth token"],
  "auth": ["authentication", "authorization"],
  "k8s": ["kubernetes"]
}
```

When searching, expand the query: if any word in the query matches a synonym key,
add the synonym values as additional OR terms.

Example: query "jwt validation" → search for "jwt validation" first, then also
search for "json web token validation" and "auth token validation" if initial
results are sparse (fewer than 3 results).

### Step 1: Discover brains to search

Use the Read tool on `{brain_path}/brain.json` to get parents and links.
For each parent/link, check if it's accessible by reading `{brain_path}/{relative_path}/brain.json`.

Build a list of accessible brains with their absolute paths.

### Step 2: Ensure server is running

`wicked-brain-call` auto-starts the server on first invocation. If you want
to be defensive, run a probe up front:

```bash
npx wicked-brain-call health
```

Exit code 0 means the server is up. Exit code 2 indicates an infra failure
(server could not be reached or spawned).

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
npx wicked-brain-call search --param query={query} --param limit={limit} --brain {brain_path}
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

### Step 4: Log search miss (if applicable)

If the merged results have 0 matches across all brains, the query is a "search miss."
Log it so the brain can learn:
```bash
npx wicked-brain-call search_misses --param query={original_query} --param session_id={session_id}
```

Note: This logging happens server-side automatically when search returns 0 results.
The explicit call here is only needed if synonym-expanded searches found results
but the original query did not.

### Step 5: Return at requested depth

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
