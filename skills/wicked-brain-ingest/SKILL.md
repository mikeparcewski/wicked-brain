---
name: wicked-brain:ingest
description: |
  Ingest source files into the brain as structured chunks. Handles text files
  (md, txt, csv, html) deterministically and binary files (pdf, docx, pptx,
  xlsx, images) via LLM vision. Dispatches a subagent for the heavy lifting.
  
  Use when: "ingest this file", "add to brain", "learn from this document",
  "index this file", "brain ingest".
---

# wicked-brain:ingest

You ingest source files into the brain by dispatching an ingest subagent.

## Config

Read `_meta/config.json` for brain path and server port.
If it doesn't exist, trigger wicked-brain:init.

## Parameters

- **source** (required): path to the file to ingest (absolute or relative to brain's raw/)

## Process

### Step 1: Copy source to raw/ (if not already there)

If the source file is outside the brain directory, copy or symlink it into `{brain_path}/raw/`.

### Step 2: Check for re-ingestion

Read `_meta/log.jsonl` and search for previous ingest entries for this source name.
If found, the subagent should archive old chunks before re-extracting.

### Step 3: Dispatch ingest subagent

The subagent receives these instructions:

```
You are an ingest agent for the digital brain at {brain_path}.

Source file: {source_path}
Source name: {safe_name} (lowercase, hyphens for special chars)
Server: http://localhost:{port}/api

## Detect file type

Check the file extension:
- Text files (md, txt, csv, html, json): use deterministic extraction
- Binary files (pdf, docx, pptx, xlsx, png, jpg, jpeg, gif, webp): use vision extraction

## For TEXT files:

1. Read the file content
2. Split into chunks:
   - Markdown: split on H1/H2 headings. If a section > 800 words, split further at paragraph breaks.
   - Other text: split into paragraph groups of ~800 words.
3. For each chunk, write to `{brain_path}/chunks/extracted/{safe_name}/chunk-NNN.md`

## For BINARY files:

1. Read the file (the LLM receives it natively as an attachment)
2. Extract content by examining the document visually
3. For PDFs: one chunk per logical section or every 3-5 pages
4. For PPTX: one chunk per slide or slide group
5. For DOCX: one chunk per section heading
6. For XLSX: one chunk per sheet, render data as markdown tables
7. For images: one chunk describing the visual content

## Chunk format

Each chunk file must have this structure:

```
---
source: {safe_name}
source_type: {extension}
chunk_id: {safe_name}/chunk-{NNN}
content_type:
  - text
contains:
  - {topic tags extracted from content}
entities:
  systems: [{named systems/platforms}]
  people: [{people/roles}]
  programs: [{programs/initiatives}]
  metrics: ["{metric}: {value}"]
confidence: {0.7 for text, 0.85 for vision}
indexed_at: {current ISO timestamp}
narrative_theme: {the "so what" in 8 words or fewer}
---

{Extracted content in markdown format}
```

## After writing each chunk:

Index it in the server:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"index","params":{"id":"{chunk_path}","path":"{chunk_path}","content":"{chunk_content}","brain_id":"{brain_id}"}}'
```

## After all chunks are written:

Append a log entry to `{brain_path}/_meta/log.jsonl`:
```json
{"ts":"{ISO timestamp}","op":"write","path":"_meta/manifest:{safe_name}","author":"deterministic:ingest","content_hash":"{hash}","word_count":{total_words}}
```

## Report back

State how many chunks were created and from what file.
```

### Step 4: Archive on re-ingest

If step 2 found previous chunks, tell the subagent to first:
```bash
mv {brain_path}/chunks/extracted/{safe_name} {brain_path}/chunks/extracted/{safe_name}.archived-$(date +%s)
```

Then proceed with fresh extraction.

### Step 5: Report to user

After the subagent returns, summarize: "{N} chunks created from {filename}"
