---
name: wicked-brain:init
description: |
  Initialize a new digital brain. Creates the directory structure, brain.json,
  and config. Auto-triggered on first use of any brain skill when no config exists.
  
  Use when: "set up a brain", "create a brain", "brain init", or when any brain
  skill detects no config.
---

# wicked-brain:init

You initialize a new digital brain on the filesystem.

## When to use

- User explicitly asks to create/initialize a brain
- Another brain skill detected no `_meta/config.json` and redirected here

## Process

### Step 1: Ask the user

Ask these questions (provide defaults):

1. "Where should your brain live?" — Default: `~/.fs-brain`
2. "What should this brain be called?" — Default: directory name

### Step 2: Create directory structure

Use the Write tool to create these directories and files:

Directories to create (use Bash `mkdir -p`):
```bash
mkdir -p {brain_path}/raw
mkdir -p {brain_path}/chunks/extracted
mkdir -p {brain_path}/chunks/inferred
mkdir -p {brain_path}/wiki/concepts
mkdir -p {brain_path}/wiki/topics
mkdir -p {brain_path}/_meta
```

### Step 3: Write brain.json

Write to `{brain_path}/brain.json`:
```json
{
  "schema": 1,
  "id": "{id}",
  "name": "{name}",
  "parents": [],
  "links": []
}
```

Where `{id}` is the directory name (lowercase, hyphens for spaces) and `{name}` is what the user provided.

### Step 4: Write config

Write to `{brain_path}/_meta/config.json`:
```json
{
  "brain_path": "{absolute_path}",
  "server_port": 4242,
  "installed_clis": []
}
```

### Step 5: Initialize the event log

Write an empty line to create the log file:
```bash
touch {brain_path}/_meta/log.jsonl
```

### Step 6: Confirm

Tell the user:
"Brain initialized at `{brain_path}`. You can now:
- `wicked-brain:ingest` to add source files
- `wicked-brain:search` to search content
- `wicked-brain:status` to check brain health"
