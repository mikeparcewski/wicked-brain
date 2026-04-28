---
name: wicked-brain:review
description: |
  Browse stored memories with filters on type, tier, and recency. Read-only —
  use wicked-brain:forget to archive or wicked-brain:agent dispatch consolidate
  to promote.

  Use when: "review my memories", "browse decisions", "what have I stored",
  "list recent gotchas", "brain review".
---

# wicked-brain:review

Filtered browse over the memory store. Combines the server `memory_stats` and
`recent_memories` actions with agent-side frontmatter filtering to render a
compact, navigable list.

## Cross-Platform Notes

This skill uses `npx wicked-brain-call` for all server interaction. The CLI
works on macOS, Linux, and Windows; it discovers the brain, auto-starts the
server, and writes a per-call audit record under `{brain}/calls/`.

- File reads use the agent-native Read tool
- Paths always use forward slashes

## Config

Brain discovery + server lifecycle are handled by `wicked-brain-call`. Pass
`--brain <path>` to override the auto-detected brain, or set
`WICKED_BRAIN_PATH`. The CLI starts the server on first call (no manual
init required) and writes an audit record to `{brain}/calls/` per call.

## Parameters

- **filter_type** (optional): `decision`, `pattern`, `preference`, `gotcha`, or `discovery`
- **filter_tier** (optional): `working`, `episodic`, or `semantic`
- **days** (optional, default 30): only include memories indexed within this many days
- **limit** (optional, default 20): max results
- **depth** (optional, default 0): 0=frontmatter only, 1=+summary line, 2=full content

## Process

### Step 1: Fetch breakdown

Start with the aggregate view so the user can see the landscape before the list:

```bash
npx wicked-brain-call memory_stats
```

Render `total`, `by_type`, `by_tier`, `by_age` as a one-line header.

### Step 2: Fetch candidates

```bash
npx wicked-brain-call recent_memories --param days={days} --param limit={limit * 3}
```

Over-fetch by 3x so agent-side type/tier filtering still returns a useful page.

### Step 3: Filter

For each returned memory, parse its frontmatter. Drop any memory whose `type`
or `tier` does not match `filter_type` / `filter_tier` when those parameters
are set. Stop once `limit` matches are collected.

### Step 4: Render

For each matching memory, render at the requested depth:

- **Depth 0**: `{path} — type={type} tier={tier} importance={importance} age={age}`
- **Depth 1**: depth 0 line + first 3 lines of content
- **Depth 2**: depth 0 line + full content

Age is derived from `indexed_at` relative to now (`Xd` / `Xh`).

### Step 5: Suggest next actions

After the list, suggest one of:
- `wicked-brain:forget path=…` to archive a specific entry
- `wicked-brain:agent dispatch consolidate` to promote patterns and drop expired entries
- `wicked-brain:retag` if many entries have thin `contains:` arrays

## Notes

- Review is read-only. It never mutates the index or files.
- For semantic search (content keywords) use `wicked-brain:search` or the
  `recall` mode of `wicked-brain:memory` — review is for browsing by metadata.
- If no filters are given and `days=30`, this is effectively "show me what I
  have been remembering lately, grouped by type and tier".
