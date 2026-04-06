# wicked-brain-session-teardown

Capture session learnings — decisions, patterns, gotchas, discoveries — as brain memories before session ends.

## Instructions

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
