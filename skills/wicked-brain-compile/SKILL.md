---
name: wicked-brain:compile
description: |
  Synthesize wiki articles from brain chunks. Dispatches a compile subagent
  that identifies concept clusters in chunks and writes structured wiki
  articles with backlinks and source attribution.
  
  Use when: "compile the brain", "write wiki articles", "synthesize knowledge",
  "brain compile".
---

# wicked-brain:compile

You compile wiki articles from the brain's chunks by dispatching a compile subagent.

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

## Process

Dispatch a compile subagent with these instructions:

```
You are a compile agent for the digital brain at {brain_path}.
Server: http://localhost:{port}/api

## Your task

Read chunks and synthesize wiki articles that capture key concepts.

## Step 1: Orient

Get brain stats:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"stats","params":{}}'
```

List existing wiki articles using your Glob tool on `{brain_path}/wiki/**/*.md`.
Shell fallback:
- macOS/Linux: `find {brain_path}/wiki -name "*.md" -type f 2>/dev/null`
- Windows: `Get-ChildItem -Recurse -Filter "*.md" "{brain_path}\wiki" 2>nul`

List chunks using your Glob tool on `{brain_path}/chunks/extracted/**/*.md`.
Shell fallback:
- macOS/Linux: `find {brain_path}/chunks/extracted -name "*.md" -type f 2>/dev/null`
- Windows: `Get-ChildItem -Recurse -Filter "*.md" "{brain_path}\chunks\extracted" 2>nul`

## Step 2: Find uncovered chunks

For each chunk directory, check if a wiki article references those chunks.
Use your Grep tool to find which chunks are already cited in wiki articles.
Shell fallback:
- macOS/Linux: `grep -rl "chunk-" {brain_path}/wiki/ 2>/dev/null`
- Windows: `findstr /s /m "chunk-" "{brain_path}\wiki\*.md" 2>nul`

Focus on chunks NOT referenced by any wiki article.

**Chunk prioritization:** When there are many uncovered chunks, process them in
this order:
1. Most recently modified (check file mtime or `authored_at` frontmatter field)
2. Highest backlink count (use `{"action":"backlinks","params":{"id":"{chunk-path}"}}` — more backlinks = more referenced by other content)

**Existing wiki articles:** For each existing wiki article, compare the
`source_hashes` in its frontmatter against the current content hash of each
source chunk (first 8 chars of the chunk body's SHA-256). If all hashes match,
the source chunks are unchanged — skip re-compilation for that article. If any
hash has changed, re-compile the article and update it in place (overwrite the
file, update `authored_at` and `source_hashes`).

## Step 3: Read uncovered chunks

Read uncovered chunks (frontmatter + body) to understand their content.
Group them by topic/concept.

## Step 4: Write wiki articles

For each concept cluster, write a wiki article to `{brain_path}/wiki/concepts/{concept-name}.md`
or `{brain_path}/wiki/topics/{topic-name}.md`:

```
---
authored_by: llm
authored_at: {ISO timestamp}
confidence: {average of source chunk confidences, rounded to 2 decimals}
source_chunks:
  - {chunk-path-1}
  - {chunk-path-2}
source_hashes:
  - {chunk-path-1}: {first 8 chars of chunk content hash}
  - {chunk-path-2}: {first 8 chars of chunk content hash}
contains:
  - {topic tags}
---

# {Concept Name}

{Article body with [[backlinks]] to source chunks.}

Every factual claim should link to its source: [[chunks/extracted/{source}/chunk-NNN]].

When updating or replacing content from an existing wiki article, use a typed
supersedes link: [[supersedes::wiki/concepts/{old-concept}]]. This creates an
explicit lineage trail so the brain can track how concepts evolve over time.

## Related

- [[other-concept]]
- [[brain-id::cross-brain-concept]] (if applicable)
```

## Step 5: Index new articles

For each article written:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"index","params":{"id":"{path}","path":"{path}","content":"{content}","brain_id":"{brain_id}"}}'
```

## Step 6: Log

Append to `{brain_path}/_meta/log.jsonl` for each article:
```json
{"ts":"{ISO}","op":"write","path":"{article_path}","author":"llm:compile","content_hash":"{hash}"}
```

## Step 7: Report

State how many articles were created/updated and what concepts they cover.
```
