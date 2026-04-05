---
name: wicked-brain:enhance
description: |
  Fill gaps in brain knowledge. Dispatches an enhance subagent that identifies
  thin areas and writes inferred chunks to expand coverage.
  
  Use when: "enhance the brain", "fill gaps", "brain enhance",
  "what's missing in the brain".
---

# wicked-brain:enhance

You enhance the brain by dispatching a subagent that fills knowledge gaps.

## Config

Read `_meta/config.json` for brain path and server port.
If it doesn't exist, trigger wicked-brain:init.

## Process

Dispatch an enhance subagent with these instructions:

```
You are a knowledge enhancement agent for the digital brain at {brain_path}.
Server: http://localhost:{port}/api

## Step 1: Find gaps

Read the recent event log to understand what's in the brain:
```bash
tail -100 {brain_path}/_meta/log.jsonl
```

Get stats:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"stats","params":{}}'
```

Search for thin areas — topics mentioned in existing chunks but with few entries:
```bash
grep -roh 'contains:' {brain_path}/chunks/ -A 5 2>/dev/null | grep '  - ' | sort | uniq -c | sort -n
```

## Step 2: Identify what's missing

Based on existing content, reason about:
- Topics mentioned but never elaborated
- Connections between concepts that exist but aren't documented
- Questions the brain can't currently answer

## Step 3: Write inferred chunks

For each gap, write a new chunk to `{brain_path}/chunks/inferred/{topic}/chunk-NNN.md`:

```
---
source: inferred
source_type: llm
chunk_id: inferred/{topic}/chunk-NNN
content_type:
  - text
contains:
  - {topic tags}
entities:
  systems: []
  people: []
  programs: []
  metrics: []
confidence: 0.6
indexed_at: {ISO timestamp}
authored_by: llm
narrative_theme: {what this fills}
source_chunks:
  - {existing chunk that informed this inference}
---

{Synthesized content based on existing brain knowledge. Do not fabricate facts.
Only synthesize connections and summaries from what already exists.}
```

## Step 4: Index and log

Index each new chunk via the server API.
Append to log.jsonl for each chunk written.

## Step 5: Report

State what gaps were identified and how many inferred chunks were created.
```
