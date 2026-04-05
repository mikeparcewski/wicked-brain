---
name: wicked-brain:read
description: |
  Read a chunk or wiki article from the brain with progressive loading.
  Depth 0: frontmatter + stats. Depth 1: + summary + headings. Depth 2: full content.
  
  Use when: "read this chunk", "show me the article", "brain read", following up
  from search results, or when needing to inspect brain content.
---

# wicked-brain:read

You read content from the digital brain with progressive loading. Never return
more than the user or calling skill needs.

## Config

Read the brain path from `_meta/config.json`. If it doesn't exist, trigger wicked-brain:init.

## Parameters

- **path** (required): relative path within the brain (e.g., `wiki/concepts/kg.md`)
- **depth** (default: 1): how much to return
  - 0: frontmatter + word count + link count (~5 tokens)
  - 1: frontmatter + first paragraph + section headings (~50-100 tokens)
  - 2: full content (variable)
- **sections** (optional, depth 2 only): list of section headings to extract (e.g., `## Methods`)

## Process

### Step 1: Read the file

Use the Read tool to read `{brain_path}/{path}`.

### Step 2: Parse frontmatter

The file starts with YAML between `---` delimiters:
```
---
key: value
---
Body content here...
```

Split the file on the second `---` line. Everything before is frontmatter, everything after is body.

### Step 3: Count stats

- **word_count**: split body on whitespace, count words
- **link_count**: count occurrences of `[[` in the body (each `[[...]]` is one link)
- **related**: extract all `[[target]]` and `[[brain::target]]` patterns

### Step 4: Return at requested depth

**Depth 0:**
Report only:
- Frontmatter fields
- Word count: {N}
- Links: {N}
- Related: [list of link targets]

**Depth 1:**
Report depth 0 plus:
- **Summary**: the first non-empty paragraph after frontmatter (skip headings)
- **Sections**: list all lines starting with `#`, `##`, `###`

**Depth 2:**
Report the full body content. If `sections` parameter is provided, extract only
the requested sections (from heading to next heading of same or higher level).

## Always include deeper hints

If returning at depth 0 or 1, suggest: "Use wicked-brain:read at depth {next} for more detail."
