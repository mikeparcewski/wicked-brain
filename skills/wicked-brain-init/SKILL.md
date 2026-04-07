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

### Step 2: Dispatch onboard agent (fire and continue)

Immediately dispatch the `wicked-brain-onboard` agent for the current project — don't wait for Steps 3–6 to finish first.

Pass it:
- `brain_path`: the path confirmed in Step 1
- `project_path`: the current working directory

**Sequencing rationale:** Onboard starts with a read-only scanning phase (Glob, Grep, Read across the project). That scanning takes meaningful time. Steps 3–6 below are fast — just creating a handful of files and directories. They will complete well before onboard finishes scanning and reaches its write phase (where it needs `brain_path` dirs to exist). So it is safe to fire onboard now and proceed immediately with Steps 3–6; the brain dirs will be in place long before onboard needs them.

Continue with Steps 3–6 immediately after dispatching.

### Step 3: Create directory structure

Use your native Write/mkdir tools to create these directories and files.

Directories to create (create each with its parent directories):
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

### Step 6: Initialize the event log

Use your Write tool to create an empty file at `{brain_path}/_meta/log.jsonl`.

Shell equivalents if needed:
```bash
# macOS/Linux
touch {brain_path}/_meta/log.jsonl
```
```powershell
# Windows PowerShell
New-Item -ItemType File -Force -Path "{brain_path}\_meta\log.jsonl"
```

### Step 7: Confirm

Tell the user:
"Brain initialized at `{brain_path}`. Onboarding agent is running in the background to index the project."
