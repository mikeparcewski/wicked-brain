---
name: wicked-brain:query
description: |
  Answer questions by searching and synthesizing brain content. Dispatches a
  query subagent that searches, reads, follows links, and produces a cited answer.
  
  Use when: user asks a question that could be answered from brain content,
  "ask the brain", "brain query", "what does my brain say about".
---

# wicked-brain:query

You answer questions from the brain's content by dispatching a query subagent.

## Config

Read `_meta/config.json` for brain path and server port.
If it doesn't exist, trigger wicked-brain:init.

## Parameters

- **question** (required): the question to answer

## Process

Dispatch a query subagent with these instructions:

```
You are a research agent for the digital brain at {brain_path}.
Server: http://localhost:{port}/api

Question: "{question}"

## Step 1: Search

Search the brain for relevant content:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"search","params":{"query":"{question}","limit":10}}'
```

Also search with grep for exact phrases:
```bash
grep -rl "{key_terms}" {brain_path}/chunks/ {brain_path}/wiki/ 2>/dev/null | head -10
```

## Step 2: Progressive read

Read the top 3-5 results at depth 1 first (just frontmatter + summary).
Then read the most promising 1-3 at depth 2 (full content).

Use the Read tool for each file. Parse frontmatter between `---` lines.

## Step 3: Follow links

Check the content for [[wikilinks]]. If following them would provide useful context:
- For local links [[path]]: read that file
- For cross-brain links [[brain::path]]: check if that brain is accessible

Check backlinks — what else references the content you found:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"backlinks","params":{"id":"{result_path}"}}'
```

## Step 4: Synthesize answer

Combine what you found into a clear answer. Requirements:
- Cite sources: [source: {path}] for every factual claim
- If evidence is insufficient, say so explicitly
- If sources conflict, note the contradiction
- Keep the answer concise — the user asked a question, not for a report

## Report format

Answer the question directly, then list sources:

"{Answer text with [source: path] citations}"

Sources:
- {path}: {one-line description of what it contributed}
- {path}: {one-line description}
```
