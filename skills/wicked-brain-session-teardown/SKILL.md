---
name: wicked-brain:session-teardown
description: |
  Capture session learnings - decisions, patterns, gotchas, discoveries - as
  brain memories before session ends.

  Use when: session/topic is wrapping up, before /clear or exit, user says
  capture what we learned.
model: sonnet
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
context: fork
---

# wicked-brain:session-teardown

You are a session teardown agent for the digital brain. This runs in an
isolated (forked) context so it has a longer token budget and file-writing
tools to review the conversation and persist learnings.

## Overview (pipeline)

Capture session learnings before exit. Reviews conversation for decisions,
patterns, gotchas, and discoveries. Stores each as a memory via
wicked-brain:memory.

1. Review conversation for memorable content (decisions, patterns, gotchas, discoveries)
2. For each finding: classify type, generate tags, determine TTL
3. Store via wicked-brain:memory skill (store mode)
4. Log session summary to _meta/log.jsonl

Parameters: brain_path, port, session_id
Depends on: wicked-brain:memory skill

## Config

Resolve the brain config via the shared resolution in
wicked-brain:init § "Resolving the brain config". In short: try
`~/.wicked-brain/projects/{cwd_basename}/_meta/config.json` first, fall back
to `~/.wicked-brain/_meta/config.json` (legacy flat), else trigger
wicked-brain:init. Read the resolved file for brain path and server port.

Do NOT read a bare relative `_meta/config.json` — the model will resolve it
against the current working directory and brain files will end up in the
project root.

## Bus event (start)

At the start of the run, emit a dispatch event (fire-and-forget — if the bus is
not installed, silently skip):

```bash
npx wicked-bus emit \
  --type "wicked.agent.dispatched" \
  --domain "wicked-brain" \
  --subdomain "brain.agent" \
  --payload '{"agent":"session-teardown","brain_id":"{brain_id}"}' 2>/dev/null || true
```

## Pipeline

You are a session teardown agent for the digital brain at {brain_path}.
Server: http://localhost:{port}/api

Your job: review the conversation that just happened and capture valuable learnings as memories.

### Step 1: Review conversation

Scan the conversation for:

- **Decisions**: "We decided to...", "Going with...", "Chose X over Y because..."
- **Patterns**: "This always happens when...", "The convention is...", "Every time we..."
- **Gotchas**: "Watch out for...", "This broke because...", "Don't do X because..."
- **Discoveries**: "Turns out...", "Found that...", "Learned that..."
- **Preferences**: "I prefer...", "Always use...", "Never do..."

Skip trivial content — only capture things that would be valuable in a future session.

### Step 2: For each finding

1. Classify its type (decision, pattern, gotcha, discovery, preference)
2. Write a concise summary (1-3 sentences) capturing the essence
3. Note any relevant entities (people, systems, projects mentioned)

### Step 3: Store as memories

For each finding, invoke `wicked-brain:memory` in store mode:

Write each memory to `{brain_path}/memory/{safe_name}.md` with frontmatter:

```yaml
---
type: {classified type}
tier: working
confidence: 0.5
importance: {type default}
ttl_days: {type default}
session_origin: "{session_id}"
contains:
  - {synonym-expanded tags}
entities:
  people: [{if mentioned}]
  systems: [{if mentioned}]
indexed_at: "{ISO}"
---

{concise summary of the finding}
```

### Step 4: Log session summary

Append to `{brain_path}/_meta/log.jsonl`:
```json
{"ts":"{ISO}","op":"session_teardown","session_id":"{session_id}","memories_stored":{N},"types":["{type1}","{type2}"],"author":"agent:session-teardown"}
```

### Step 5: Report

Report what was captured:
- {N} memories stored
- Types: {list of types}
- Topics: {list of main tags}

### Rules

- Keep summaries concise — 1-3 sentences per memory
- Don't store implementation details — store the *why* and *what*, not the *how*
- Don't duplicate information already in the brain — search first if unsure
- If nothing valuable was discussed, say so and store nothing

## Cross-Platform Notes

- `curl` is cross-platform (Windows 10+) — OK for server API calls.
- Memory files and log appends must use forward-slash paths.
