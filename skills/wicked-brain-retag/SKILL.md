---
name: wicked-brain:retag
description: |
  Backfill synonym-expanded tags on chunks and memories that have fewer than
  5 tags. Run periodically or as part of consolidation.

  Use when: "retag the brain", "expand tags", "backfill synonyms",
  "brain retag", "improve tagging".
---

# wicked-brain:retag

Scan chunks and memories with thin tagging and expand their `contains:` with synonyms and related terms.

## Cross-Platform Notes

- Uses Glob tool for file discovery (not shell `find`)
- Uses Read tool for frontmatter parsing (not shell `head`)
- Uses Edit tool for frontmatter updates (not shell `sed`)
- No shell commands required — fully agent-native

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

- **dry_run** (optional, default false): if true, report what would change without writing
- **min_tags** (optional, default 5): threshold — only retag docs with fewer tags than this

## Process

### Step 1: Find under-tagged documents

Use Glob to find all markdown files:

```
{brain_path}/chunks/**/*.md
{brain_path}/memory/**/*.md
```

### Step 2: Read frontmatter at depth 0

For each file, read the YAML frontmatter between `---` lines. Parse the `contains:` array. Filter to files with fewer than {min_tags} tags.

### Step 3: Expand tags

For each under-tagged document, read at depth 1 (first ~10 lines of content after frontmatter). Generate expanded tags:

#### Check learned synonyms

Before LLM expansion, check if `{brain_path}/_meta/synonyms.json` exists.
For each existing tag, look it up in the synonym map. Learned expansions take
priority over LLM-generated ones. Supplement with LLM expansions for tags
not in the map.

**Fallback behavior:** If `synonyms.json` is missing or cannot be parsed (malformed
JSON, permission error, etc.), do not fail. Simply skip the synonym-map lookup for
that document and proceed with LLM-only expansion. Never abort the retag operation
because of a missing or broken synonyms file — it is an optional accelerant, not a
hard dependency.

- For each existing tag, add 1-3 synonyms or related terms
- Extract additional keywords from the content summary
- Apply the same expansion rules as wicked-brain:memory store:
  - Abbreviations: JWT → "json-web-token"
  - Synonyms: "auth" → "authentication"
  - Related concepts: "JWT" → "tokens", "session", "security"
  - Domain hierarchy: "PostgreSQL" → "database", "RDBMS"
- Deduplicate and cap at 15 tags total

### Step 4: Update or report

If **dry_run**: report the file path, current tag count, and proposed new tags.

If not dry_run: update the `contains:` field in the YAML frontmatter in-place using the Edit tool. The server's file watcher will detect the change and re-index.

### Step 5: Summary

Report:
- Total files scanned
- Files under threshold
- Files updated (or would-be-updated in dry run)
- Sample of expanded tags for verification

## Performance Guidance

For brains with 1000+ chunks, process files in batches of 100 rather than all at once.
After each batch, report progress (e.g., "Updated 100/1247 files...") so the user can
see the operation is running.

The operation is safe to interrupt and resume: retag only updates existing chunks in
place and never deletes data. On resume, Step 2's tag-count filter will naturally skip
files that were already expanded in a previous run (they will meet the `min_tags`
threshold). No state file or checkpoint is needed.
