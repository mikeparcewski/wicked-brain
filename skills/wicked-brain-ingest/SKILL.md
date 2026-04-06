---
name: wicked-brain:ingest
description: |
  Ingest source files into the brain as structured chunks. Handles text files
  (md, txt, csv, html) deterministically and binary files (pdf, docx, pptx,
  xlsx, images) via LLM vision. Dispatches a subagent for the heavy lifting.
  
  Use when: "ingest this file", "add to brain", "learn from this document",
  "index this file", "brain ingest", "ingest this directory".
---

# wicked-brain:ingest

You ingest source files into the brain by dispatching an ingest subagent.

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

## Parameters

- **source** (required): path to a file or directory to ingest

## Process

### Step 1: Assess scope

Determine if the source is a single file or a directory.

- **Single file**: dispatch a subagent to ingest it directly (Step 3a)
- **Directory or multiple files**: use the batch script pattern (Step 3b)

### Step 2: Copy source to raw/ (if not already there)

If the source is outside the brain directory, symlink or copy it into `{brain_path}/raw/`.
Prefer symlinks to avoid duplicating large files:
- macOS/Linux: `ln -s "{source}" "{brain_path}/raw/{name}"`
- Windows: `New-Item -ItemType SymbolicLink -Path "{brain_path}\raw\{name}" -Target "{source}"`

### Step 3a: Single file ingest (subagent)

Dispatch an ingest subagent with these instructions:

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
   - Code files (.py, .js, .jsx, .ts): one chunk per file. Tag with language.
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

## After writing chunks, index them in the server:

curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"index","params":{"id":"{chunk_path}","path":"{chunk_path}","content":"{chunk_content}","brain_id":"{brain_id}"}}'

## Report back

State how many chunks were created and from what file.
```

### Step 3b: Batch ingest (script generation)

When ingesting a directory or many files, **do not ingest files one-by-one in conversation**.
Instead, write a batch script and run it. This preserves context and is dramatically faster.

**The pattern:**

1. Detect what runtime is available. Check in order:
   - Node.js: `node --version`
   - Python: `python3 --version` or `python --version`
   - Shell: always available as fallback

2. Write a script to the brain's `_meta/` directory that:
   - Walks the source directory
   - Filters by file extension (text types for deterministic, binary types for listing)
   - For each text file: reads content, splits into chunks, writes chunk .md files, curls the index API
   - For binary files: lists them for separate vision-based ingest
   - Logs progress to stdout
   - Writes a summary at the end

3. Run the script:
   ```bash
   node {brain_path}/_meta/batch-ingest.mjs   # or .py or .sh
   ```

4. Read the output and report results to the user

5. For any binary files identified, either:
   - Dispatch individual vision ingest subagents for the most important ones
   - Report the list and let the user choose which to vision-ingest

**Example Node.js batch script structure:**

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename, relative } from "node:path";
import { createHash } from "node:crypto";

const BRAIN = "{brain_path}";
const PORT = {port};
const BRAIN_ID = "{brain_id}";
const SOURCE_DIR = "{source_dir}";

const TEXT_EXT = new Set([".md",".txt",".csv",".html",".htm",".json",".py",".js",".jsx",".ts",".tsx",".sh"]);
const BINARY_EXT = new Set([".pdf",".docx",".pptx",".xlsx",".png",".jpg",".jpeg",".gif",".webp"]);

const binaryFiles = [];
let totalChunks = 0;
let totalFiles = 0;

function safeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

async function indexChunk(id, path, content) {
  try {
    await fetch(`http://localhost:${PORT}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "index", params: { id, path, content, brain_id: BRAIN_ID } }),
    });
  } catch (e) {
    console.error(`  Failed to index ${id}: ${e.message}`);
  }
}

function splitMarkdown(text) {
  const sections = text.split(/(?=^#{1,2}\s)/m).filter(s => s.trim());
  if (sections.length === 0) return [text];
  // Sub-split sections > 800 words
  const result = [];
  for (const section of sections) {
    const words = section.split(/\s+/).length;
    if (words > 800) {
      const paragraphs = section.split(/\n\n+/);
      let current = [];
      let count = 0;
      for (const p of paragraphs) {
        const w = p.split(/\s+/).length;
        if (count + w > 800 && current.length > 0) {
          result.push(current.join("\n\n"));
          current = [p];
          count = w;
        } else {
          current.push(p);
          count += w;
        }
      }
      if (current.length > 0) result.push(current.join("\n\n"));
    } else {
      result.push(section);
    }
  }
  return result;
}

function splitText(text) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = [];
  let count = 0;
  for (const p of paragraphs) {
    const w = p.split(/\s+/).length;
    if (count + w > 800 && current.length > 0) {
      chunks.push(current.join("\n\n"));
      current = [p];
      count = w;
    } else {
      current.push(p);
      count += w;
    }
  }
  if (current.length > 0) chunks.push(current.join("\n\n"));
  return chunks.length > 0 ? chunks : [text];
}

async function ingestFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const rel = relative(SOURCE_DIR, filePath);
  const name = safeName(rel);
  const chunkDir = join(BRAIN, "chunks", "extracted", name);
  mkdirSync(chunkDir, { recursive: true });

  const content = readFileSync(filePath, "utf-8");
  const chunks = ext === ".md" ? splitMarkdown(content) : splitText(content);

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `${name}/chunk-${String(i + 1).padStart(3, "0")}`;
    const chunkPath = `chunks/extracted/${chunkId}.md`;
    const ts = new Date().toISOString();
    const keywords = [...new Set(chunks[i].toLowerCase().replace(/[^a-z0-9\s-]/g,"").split(/\s+/).filter(w => w.length > 5))].slice(0, 10);

    const frontmatter = [
      "---",
      `source: ${basename(filePath)}`,
      `source_type: ${ext.slice(1)}`,
      `chunk_id: ${chunkId}`,
      "content_type:",
      "  - text",
      "contains:",
      ...keywords.map(k => `  - ${k}`),
      `confidence: 0.7`,
      `indexed_at: "${ts}"`,
      "---",
    ].join("\n");

    const fullContent = `${frontmatter}\n\n${chunks[i]}`;
    writeFileSync(join(BRAIN, chunkPath), fullContent);
    await indexChunk(chunkPath, chunkPath, chunks[i]);
    totalChunks++;
  }

  totalFiles++;
  console.log(`  ${name}: ${chunks.length} chunks`);
}

function walk(dir, callback) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__" || entry.name === "package-lock.json") continue;
    if (entry.isDirectory()) walk(full, callback);
    else if (entry.isFile()) callback(full);
  }
}

console.log(`Ingesting from ${SOURCE_DIR}...`);

walk(SOURCE_DIR, (filePath) => {
  const ext = extname(filePath).toLowerCase();
  if (TEXT_EXT.has(ext)) {
    try { ingestFile(filePath); } catch (e) { console.error(`  Error: ${filePath}: ${e.message}`); }
  } else if (BINARY_EXT.has(ext)) {
    binaryFiles.push(filePath);
  }
});

// Wait for all index operations
await new Promise(r => setTimeout(r, 1000));

console.log(`\nDone: ${totalFiles} files, ${totalChunks} chunks indexed`);
if (binaryFiles.length > 0) {
  console.log(`\nBinary files needing vision ingest (${binaryFiles.length}):`);
  for (const f of binaryFiles) console.log(`  ${f}`);
}
```

This pattern should be used **whenever more than 5 files need processing**. It:
- Preserves agent context (no 50 Read/Write/Bash cycles)
- Runs fast (single process, no round-trips)
- Works cross-platform (Node.js is available everywhere wicked-brain runs)
- Reports results the agent can summarize

### Step 4: Archive on re-ingest

If previous chunks exist for a source, archive them first.
Use the agent's native move/rename capability, or shell equivalents:
- macOS/Linux: `mv "{brain_path}/chunks/extracted/{safe_name}" "{brain_path}/chunks/extracted/{safe_name}.archived-$(date +%s)"`
- Windows: `Rename-Item "{brain_path}\chunks\extracted\{safe_name}" "{safe_name}.archived-{timestamp}"`

### Step 5: Report to user

After the subagent or batch script completes, summarize:
- "{N} text files ingested, {M} chunks created"
- "{K} binary files identified for vision ingest" (if any)
- Offer to vision-ingest the most important binary files
