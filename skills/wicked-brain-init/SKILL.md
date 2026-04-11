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

## Per-project brains (important)

**Each project gets its own brain under `~/.wicked-brain/projects/{project-name}/`.**
Do NOT initialize a single monolithic brain at `~/.wicked-brain/` — that overwhelms
the index, mixes unrelated content across clients/codebases, and makes federated
search useless.

The structure is:
```
~/.wicked-brain/                          # parent directory (not a brain)
  projects/
    my-app/                               # one brain per project
      brain.json
      chunks/
      _meta/
    client-site/                          # another project's brain
      brain.json
      ...
```

Project name defaults to the basename of the current working directory
(lowercase, hyphens for spaces). A supervising "meta-brain" agent can watch
`~/.wicked-brain/projects/*` and federate across all of them via
`brain.json` links.

For the brain path default:
- macOS/Linux: `~/.wicked-brain/projects/{project_name}`
- Windows: `%USERPROFILE%\.wicked-brain\projects\{project_name}`

## When to use

- User explicitly asks to create/initialize a brain
- Another brain skill detected no `_meta/config.json` and redirected here

## Process

### Step 1: Ask the user

Compute the default project name from the current working directory basename
(lowercase, replace non-alphanumerics with hyphens). Then ask:

1. "What should this project's brain be called?" — Default: `{cwd_basename}`
2. "Where should it live?" — Default:
   - macOS/Linux: `~/.wicked-brain/projects/{project_name}`
   - Windows: `%USERPROFILE%\.wicked-brain\projects\{project_name}`

If the user supplies a path that is exactly `~/.wicked-brain` (the parent
directory, not a project subdirectory), push back: explain the per-project
convention and suggest `~/.wicked-brain/projects/{project_name}` instead.
Only accept the flat path if the user explicitly insists.

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
