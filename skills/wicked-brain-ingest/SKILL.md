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

Resolve the brain config via the shared resolution in
wicked-brain:init § "Resolving the brain config". In short: try
`~/.wicked-brain/projects/{cwd_basename}/_meta/config.json` first, fall back
to `~/.wicked-brain/_meta/config.json` (legacy flat), else trigger
wicked-brain:init. Read the resolved file for brain path and server port.

Do NOT read a bare relative `_meta/config.json` — the model will resolve it
against the current working directory and brain files will end up in the
project root.

## Parameters

- **source** (required): path to a file or directory to ingest

## Process

### Step 0: Ensure server is running

Before doing anything else, health-check the server:

```bash
curl -s -f -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"health","params":{}}'
```

If this fails (connection refused or non-2xx), invoke `wicked-brain:server` to start it
before continuing. Re-read `{brain_path}/_meta/config.json` (the resolved
config from the Config section above) after the server starts to get the
actual port it bound to.

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

## Tag Expansion

After generating the initial `contains:` tags, expand each keyword with 1-3 synonyms or related terms:

- **Abbreviations**: JWT → "json-web-token", K8s → "kubernetes", API → "application-programming-interface"
- **Synonyms**: "auth" → "authentication", "DB" → "database", "config" → "configuration"
- **Related concepts**: "JWT" → "tokens", "session", "security"; "PostgreSQL" → "database", "RDBMS"
- **Domain hierarchy**: specific terms get their general category added

Add expanded tags to `contains:` alongside originals. Deduplicate. Cap total tags at 15 per chunk.

Example:
  Original tags: ["jwt", "session", "expiry"]
  After expansion: ["jwt", "json-web-token", "tokens", "security", "session", "session-management", "expiry", "timeout", "ttl"]

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
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync } from "node:fs";
import { join, extname, basename, relative } from "node:path";

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

async function removeOldChunks(name) {
  const chunkDir = join(BRAIN, "chunks", "extracted", name);
  if (!existsSync(chunkDir)) return;
  const ts = Math.floor(Date.now() / 1000);
  // Remove each chunk from the search index before archiving
  for (const f of readdirSync(chunkDir).filter(f => f.endsWith(".md"))) {
    const id = `chunks/extracted/${name}/${f}`;
    try {
      await fetch(`http://localhost:${PORT}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", params: { id } }),
      });
    } catch (e) {
      console.error(`  Failed to remove ${id}: ${e.message}`);
    }
  }
  // Archive the old directory
  renameSync(chunkDir, `${chunkDir}.archived-${ts}`);
  console.log(`  Archived old chunks: ${name}`);
}

async function ingestFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const rel = relative(SOURCE_DIR, filePath);
  const name = safeName(rel);
  await removeOldChunks(name);
  const chunkDir = join(BRAIN, "chunks", "extracted", name);
  mkdirSync(chunkDir, { recursive: true });

  const content = readFileSync(filePath, "utf-8");
  const chunks = ext === ".md" ? splitMarkdown(content) : splitText(content);

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `${name}/chunk-${String(i + 1).padStart(3, "0")}`;
    const chunkPath = `chunks/extracted/${chunkId}.md`;
    const ts = new Date().toISOString();
    const STOP = new Set([
      "should","would","could","their","about","which","these","those",
      "there","where","other","after","before","during","while","being",
      "having","because","through","between","without","against","itself",
      "become","becomes","another","however","already","always","around"
    ]);

    // Note: These keywords are for FTS indexing. The LLM-based ingest
    // generates richer synonym-expanded tags in the contains: field.
    // This batch script extracts basic keywords only.
    // Replace non-word chars with space (not empty) so adjacent tokens don't glue.
    // Preserve underscores so snake_case identifiers survive. Floor at 4 chars so
    // short domain terms like 'task', 'hook', 'crew' aren't dropped.
    const cleaned = chunks[i].toLowerCase().replace(/[^a-z0-9_\s-]/g, " ");
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const keywords = [...new Set(
      tokens.filter(w => w.length >= 4 && !STOP.has(w))
    )].slice(0, 12);

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

// Collect files first, then process serially so every ingestFile is awaited
const textFiles = [];
walk(SOURCE_DIR, (filePath) => {
  const ext = extname(filePath).toLowerCase();
  if (TEXT_EXT.has(ext)) textFiles.push(filePath);
  else if (BINARY_EXT.has(ext)) binaryFiles.push(filePath);
});

for (const filePath of textFiles) {
  try { await ingestFile(filePath); } catch (e) { console.error(`  Error: ${filePath}: ${e.message}`); }
}

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

If previous chunks exist for a source, **remove them from the search index before archiving**.
Archived files are invisible to the file watcher, so the server won't clean them up automatically.

1. List all .md files in `{brain_path}/chunks/extracted/{safe_name}/`
2. For each file, call the server to remove it from the index:
   ```bash
   curl -s -X POST http://localhost:{port}/api \
     -H "Content-Type: application/json" \
     -d '{"action":"remove","params":{"id":"chunks/extracted/{safe_name}/chunk-NNN.md"}}'
   ```
3. Then rename the directory to archive it:
   - macOS/Linux: `mv "{brain_path}/chunks/extracted/{safe_name}" "{brain_path}/chunks/extracted/{safe_name}.archived-$(date +%s)"`
   - Windows: `Rename-Item "{brain_path}\chunks\extracted\{safe_name}" "{safe_name}.archived-{timestamp}"`

### Step 5: Record source path

After ingesting a directory, write the absolute source path to the resolved `{brain_path}/_meta/config.json`
so the brain server can use it as the LSP workspace root (enabling symbol lookup,
go-to-definition, and diagnostics for the ingested project):

```bash
# Read current config, add source_path, write back
python3 -c "
import json, sys
path = '{brain_path}/_meta/config.json'
with open(path) as f: cfg = json.load(f)
cfg['source_path'] = '{absolute_source_path}'
with open(path, 'w') as f: json.dump(cfg, f, indent=2)
print('source_path recorded')
" 2>/dev/null || python -c "
import json, sys
path = '{brain_path}/_meta/config.json'
with open(path) as f: cfg = json.load(f)
cfg['source_path'] = '{absolute_source_path}'
with open(path, 'w') as f: json.dump(cfg, f, indent=2)
print('source_path recorded')
"
```

Skip this step if the source is a single file rather than a project directory.

### Step 6: Report to user

After the subagent or batch script completes, summarize:
- "{N} text files ingested, {M} chunks created"
- "{K} binary files identified for vision ingest" (if any)
- Offer to vision-ingest the most important binary files
