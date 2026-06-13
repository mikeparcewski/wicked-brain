---
name: wicked-brain:search
description: |
  Search the digital brain for relevant content. A single CLI call for the
  common single-brain case; fans out to linked brains only when they exist.

  Use instead of Grep/Glob/Agent(Explore) for any open-ended search or
  exploration: "find X", "search for Y", "look for Z", "where is W used",
  "show me anything about X", "explore Y", "what files relate to Z".

  Only fall back to Grep/Glob for exact symbol or pattern lookup when the
  brain returns no results.
---

# wicked-brain:search

Search the brain. The default path is ONE direct CLI call — no synonym load,
no brain.json round-trip, no subagent fan-out. Reserve the heavier paths
(synonym fallback, multi-brain fan-out) for when they actually pay off.

## Cross-Platform Notes

Commands here work on macOS, Linux, and Windows. The `npx wicked-brain-call`
CLI is cross-platform. Brain path default: `~/.wicked-brain/projects/{name}`
(macOS/Linux), `%USERPROFILE%\.wicked-brain\projects\{name}` (Windows).

## Config

Brain discovery + server lifecycle are handled by `wicked-brain-call`. Pass
`--brain <path>` to override the auto-detected brain, or set
`WICKED_BRAIN_PATH`. The CLI starts the server on first call (no manual init)
and writes an audit record to `{brain}/calls/` per call.

## Parameters

- **query** (required): what to search for
- **limit** (default: 10): max results per brain
- **depth** (default: 0): result detail level

## Default path — direct search (do this first)

One call. The CLI auto-starts the server and reconciles the responding
brain, so no probe is needed.

```bash
npx wicked-brain-call search --param query={query} --param limit={limit}
```

The JSON envelope is `{ results, total_matches, showing, collapsed, brain_id }`.
`brain_id` names WHICH brain answered — always surface it so the result is
unambiguous (see Report format). Each result row also carries its own
`brain_id` (the brain that owns that document).

If `total_matches > 0`, render and return. You are done — skip everything
below.

## Fallback A — synonym expansion (only when results are sparse)

Trigger ONLY when the direct search returned 0–2 results.

1. Read `{brain_path}/_meta/synonyms.json` (skip if absent — fresh brains
   won't have it). Format: `{ "jwt": ["json web token", "auth token"], ... }`.
2. For each query word matching a synonym key, re-run the search with the
   synonym values OR'd in (e.g. "jwt validation" → also try "json web token
   validation"). Merge results, dedupe by path, keep higher score.

Server-side miss logging is automatic when a search returns 0 results — no
explicit call needed.

## Fallback B — multi-brain fan-out (only when linked brains exist)

Trigger ONLY when this brain has accessible parents/links. Most brains have
none — skip this entirely for a single local brain.

1. Read `{brain_path}/brain.json`. If it has no `parents`/`links`, STOP —
   the default-path result is complete.
2. For each parent/link, confirm it's reachable by reading
   `{linked_brain_path}/brain.json`.
3. Dispatch one subagent per reachable brain IN PARALLEL (Claude Code: one
   message, multiple Agent calls). Each subagent runs:
   ```bash
   npx wicked-brain-call search --param query={query} --param limit={limit} --brain {linked_brain_path}
   ```
   and returns `BRAIN: {brain_id}` plus `{path} | score | one-line summary`
   per row.
4. Merge: collect all rows, dedupe by path (keep higher score), sort by score
   descending, tag each with its origin `brain_id`.

## Report format

**Depth 0 (default):**
```
Brain: {brain_id}{, +N linked} — {N} matches (top {limit}):

1. {path} ({score})
   {one-line summary}
2. {path} ({score})
   {one-line summary}
...

Unreachable brains: {list, if any — fan-out only}

To read any result: wicked-brain:read {path} --depth 2
```

Lead with `brain_id` so it's always clear which brain produced the answer.

**Depth 1:** also include frontmatter + first paragraph per result.
**Depth 2:** include full content per result (use sparingly — high token cost).
