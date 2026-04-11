---
name: wicked-brain:init
description: |
  Initialize a new digital brain. Creates the directory structure, brain.json,
  and config. Auto-triggered on first use of any brain skill when no config exists.
  
  Use when: "set up a brain", "create a brain", "brain init", or when any brain
  skill detects no config.
---

# wicked-brain:init

You initialize a new digital brain on the filesystem and get it fully operational.

## Cross-Platform Notes

Commands in this skill work on macOS, Linux, and Windows. When a command has
platform differences, alternatives are shown. Your native tools (Read, Write,
Grep, Glob) work everywhere — prefer them over shell commands when possible.

For the brain path default:
- macOS/Linux: ~/.wicked-brain
- Windows: %USERPROFILE%\.wicked-brain

## When to use

- User explicitly asks to create/initialize a brain
- Another brain skill detected no `_meta/config.json` and redirected here

## Process

### Step 1: Ask the user

Ask these questions (provide defaults):

1. "Where should your brain live?"
   - Default (macOS/Linux): `~/.wicked-brain`
   - Default (Windows): `%USERPROFILE%\.wicked-brain`
2. "What should this brain be called?" — Default: directory name

### Step 2: Check for existing brain

If `{brain_path}/_meta/config.json` already exists, tell the user:
"A brain already exists at `{brain_path}`. Do you want to re-initialize it (keeps existing chunks) or pick a different path?"

Stop and wait for their answer before continuing.

### Step 3: Create directory structure

Use your native Write tool to create these directories (write a `.gitkeep` placeholder in each):
- `{brain_path}/raw`
- `{brain_path}/chunks/extracted`
- `{brain_path}/chunks/inferred`
- `{brain_path}/wiki/concepts`
- `{brain_path}/wiki/topics`
- `{brain_path}/_meta`

Shell equivalents if needed:
```bash
# macOS/Linux
mkdir -p {brain_path}/raw {brain_path}/chunks/extracted {brain_path}/chunks/inferred \
  {brain_path}/wiki/concepts {brain_path}/wiki/topics {brain_path}/_meta
```
```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force -Path "{brain_path}\raw","{brain_path}\chunks\extracted","{brain_path}\chunks\inferred","{brain_path}\wiki\concepts","{brain_path}\wiki\topics","{brain_path}\_meta"
```

### Step 4: Write brain.json

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

### Step 5: Write config

Write to `{brain_path}/_meta/config.json`:
```json
{
  "brain_path": "{absolute_path}",
  "server_port": 4242,
  "installed_clis": []
}
```

`server_port: 4242` is the *preferred* port. The server will find a free port starting
from this value on startup and write the actual port back to this file. You do not
need to find a free port manually.

### Step 6: Initialize the event log

Use your Write tool to create an empty file at `{brain_path}/_meta/log.jsonl`.

### Step 7: Start the server

Invoke `wicked-brain:server` to start the server against this brain path.
The server will pick a free port and write it back to `_meta/config.json`.

```bash
npx wicked-brain-server --brain {brain_path} &
```

Wait for the health check to confirm it's up before continuing.

### Step 8: Ingest the project

Invoke `wicked-brain:ingest` with:
- `brain_path`: `{brain_path}`
- `source`: the current working directory

This indexes the project files so the brain is immediately queryable.

### Step 9: Confirm

Tell the user:
"Brain `{name}` is ready at `{brain_path}` — {N} files ingested, {M} chunks indexed.

Run `wicked-brain:compile` to synthesize wiki articles from the indexed content."
