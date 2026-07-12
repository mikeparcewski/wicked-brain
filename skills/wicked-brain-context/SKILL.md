---
name: wicked-brain-context
description: |
  Surface relevant brain knowledge for the current prompt. Tiered routing - hot
  path for simple prompts, fast path for complex.

  Use when: starting a new topic/unfamiliar area, at the start of a work
  session, prompt would benefit from prior decisions/patterns/wiki.
model: haiku
allowed-tools: Read, Bash, Grep, Glob
---

# wicked-brain:context

You are a context assembly agent for the digital brain. This is a HOT-PATH
enrichment skill: it runs INLINE in the current turn (it is what the
UserPromptSubmit / BeforeAgent hook nudges) and must stay fast. It does NOT run
in a forked context — return pointers to the host agent in the same turn.

It emits a `wicked.agent.dispatched` bus event (see "Bus event" below) —
fire-and-forget and non-blocking, so the hot path never waits on it. Only reads
and returns pointers — no Write/Edit.

## Overview (pipeline)

Tiered knowledge surfacing for ambient context. Hot path for simple prompts
(recent memories + high-confidence wiki). Fast path for complex prompts (full
search + scoring pipeline).

1. Classify prompt complexity (short/single-topic → hot, complex/multi-topic → fast)
2. Hot path: recent memories (7 days) + wiki (confidence > 0.8), return depth 0
3. Fast path: decompose query → synonym-expand → search all content → score by keyword overlap + type + tier + recency → return depth 0
4. Agent reads deeper (depth 1/2) on promising results as needed

Parameters: brain_path, port, session_id, prompt (the user's current prompt text)
Depends on: server search action, synonym expansion

## Config

Resolve the brain config via the shared resolution in
wicked-brain:init § "Resolving the brain config". In short: try
`~/.wicked-brain/projects/{cwd_basename}/_meta/config.json` first, fall back
to `~/.wicked-brain/_meta/config.json` (legacy flat), else trigger
wicked-brain:init. Read the resolved file for brain path and server port.

Do NOT read a bare relative `_meta/config.json` — the model will resolve it
against the current working directory and brain files will end up in the
project root.

## Bus event

At the start of the run, emit a dispatch event (fire-and-forget — if the bus is
not installed, silently skip). Same type, domain, and subdomain as the sibling
skills (`wicked-brain-consolidate`, `wicked-brain-onboard`,
`wicked-brain-session-teardown`), with an `agent:context` payload.

Because this is the inline hot path, run the emit non-blocking (background it)
so returning pointers to the host agent never waits on it:

```bash
npx wicked-bus emit \
  --type "wicked.agent.dispatched" \
  --domain "wicked-brain" \
  --subdomain "brain.agent" \
  --payload '{"agent":"context","brain_id":"{brain_id}"}' 2>/dev/null || true
```

## Pipeline

You are a context assembly agent for the digital brain at {brain_path}.
Server: http://localhost:{port}/api

Your job: surface relevant brain knowledge for the current prompt. Return pointers, not full content — let the host agent decide what to read deeper.

### Step 1: Classify prompt complexity

Analyze the prompt:
- **Hot path** if: prompt is < 20 words, single topic, simple question, or a follow-up
- **Fast path** if: prompt is > 20 words, multi-topic, requires cross-domain knowledge, or is a new conversation thread

### Step 2a: Hot Path (simple prompts)

**First**, fetch recent memories (last 7 days) using the dedicated `recent_memories` action:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"recent_memories","params":{"days":7,"limit":10}}'
```

**Then**, search for wiki articles matching the prompt:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"search","params":{"query":"{key terms from prompt}","limit":5,"session_id":"{session_id}"}}'
```

Filter wiki search results to `wiki/` paths only. For wiki results, read frontmatter and filter to `confidence > 0.8`.

**Merge**: memories first, then wiki results. Deduplicate by path.

Return results at depth 0:
```
Context (hot path, {N} results):
- {path} | {type} | {one-line from snippet or frontmatter}
- {path} | {type} | {one-line from snippet or frontmatter}
```

### Step 2b: Fast Path (complex prompts)

1. **Decompose**: Extract 3-5 key terms from the prompt. For each, generate 1-2 synonyms.

2. **Search**: Run parallel searches for each term + synonym:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"search","params":{"query":"{term}","limit":5,"session_id":"{session_id}"}}'
```

3. **Deduplicate**: Merge results across searches, removing duplicate paths.

4. **Score**: For each unique result, compute a composite relevance score:
   - **Keyword overlap** (0.35): how many search terms appear in the snippet
   - **Type boost** (0.25): decision=+0.25, preference=+0.25, wiki=+0.20, pattern=+0.15, chunk=+0.10
   - **Tier multiplier** (0.20): read frontmatter for `tier:` field. semantic=1.3, episodic=1.0, working=0.8. Multiply against 0.20 base.
   - **Recency** (0.20): `1.0 - min((now - indexed_at) / 90_days, 1.0)`

5. **Rank**: Sort by composite score descending. Take top 10.

6. **Return** at depth 0:
```
Context (fast path, {N} results):
- {path} | score:{score} | {type} | {one-line from snippet}
- {path} | score:{score} | {type} | {one-line from snippet}
```

### What NOT to do

- Do NOT read full document content — return pointers only
- Do NOT inject context silently — return it to the host agent for decision
- Do NOT run both paths — pick one based on Step 1 classification
- Do NOT spend more than 5 search calls on the hot path

## Cross-Platform Notes

- `curl` is cross-platform (Windows 10+) — OK for server API calls.
- This skill only reads (Read, Bash, Grep, Glob) — no file writes.
