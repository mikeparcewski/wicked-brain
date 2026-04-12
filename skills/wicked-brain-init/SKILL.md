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

## Resolving the brain config

**This section is the canonical resolution logic. Other skills point here —
keep it authoritative.** Never read a bare relative `_meta/config.json`: the
model will resolve it against the current working directory and brain files
will land in the project root.

To locate the brain config for the current session:

1. Compute `{cwd_basename}` — the basename of the current working directory,
   lowercased, with non-alphanumerics replaced by hyphens.
2. Try `~/.wicked-brain/projects/{cwd_basename}/_meta/config.json` first
   (Windows: `%USERPROFILE%\.wicked-brain\projects\{cwd_basename}\_meta\config.json`).
3. If that file doesn't exist, fall back to the legacy flat path
   `~/.wicked-brain/_meta/config.json` (Windows:
   `%USERPROFILE%\.wicked-brain\_meta\config.json`).
4. If neither exists, trigger `wicked-brain:init`.
5. Read the resolved file. It contains `brain_path` and `server_port` (and
   optionally `source_path`). All subsequent operations use these values —
   never hardcode the port or path.

Any skill that needs to read, write, or reference `_meta/config.json` MUST use
this resolution. Never compute `_meta/config.json` against the project's `cwd`.

## When to use

- User explicitly asks to create/initialize a brain
- Another brain skill detected no `_meta/config.json` and redirected here

## Process

### Step 1: Ask the user

**Ask in this exact order — do not reverse the questions:**

First, compute `{cwd_basename}`: take the basename of the current working directory,
lowercase it, and replace any non-alphanumeric characters with hyphens.

Then ask **two questions, in order**:

1. **"What should this project's brain be called?"**
   - Default: `{cwd_basename}` (the current directory name, not the string "wicked-brain")
   - Wait for the user's answer (or acceptance of default) before asking question 2.

2. **"Where should it live?"**
   - Default:
     - macOS/Linux: `~/.wicked-brain/projects/{project_name}` (where `{project_name}` is the name from question 1)
     - Windows: `%USERPROFILE%\.wicked-brain\projects\{project_name}`
   - The default path MUST include the `projects/` subdirectory and the project name.
     **Never default to just `~/.wicked-brain/`** — that is the parent container, not a brain.

If the user supplies a path that is exactly `~/.wicked-brain` (the parent
directory, not a project subdirectory), push back: explain the per-project
convention and suggest `~/.wicked-brain/projects/{project_name}` instead.
Only accept the flat path if the user explicitly insists.

### Step 2: Check for existing brains

#### 2a: Detect a flat brain at the parent path

If `~/.wicked-brain/brain.json` exists (note: `brain.json` at the flat parent
path, NOT inside a `projects/` subdirectory), this is a legacy flat brain from
before v0.4.7. Stop and tell the user:

"I found an existing flat brain at `~/.wicked-brain/`. The current layout puts
each project under `~/.wicked-brain/projects/{name}/`. I can migrate the flat
brain with `wicked-brain:migrate` before creating the new one. Migrate now?"

If yes, invoke `wicked-brain:migrate` with `flat_path=~/.wicked-brain` and
wait for it to complete before continuing.

If no, confirm the user wants to keep the flat brain and proceed (accept the
tradeoff: the new project brain will live under `projects/` but the old one
stays at the flat path).

#### 2b: Check target path

If `{brain_path}/_meta/config.json` already exists at the chosen target, tell the user:
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

`server_port: 4242` is the *preferred* starting port, not the guaranteed port.
When the server starts in Step 7, it probes from this value upward until it
finds a free port, then writes the **actual** port back to this same file.
If multiple project brains run at once, each gets a distinct port (4242, 4243,
4244, ...). Always re-read `_meta/config.json` after the server starts to get
the real port — never hardcode `4242` in downstream calls.

### Step 6: Initialize the event log

Use your Write tool to create an empty file at `{brain_path}/_meta/log.jsonl`.

### Step 7: Start the server

Invoke `wicked-brain:server` to start the server against this brain path.
The server will pick a free port and write it back to `_meta/config.json`.

```bash
npx wicked-brain-server --brain {brain_path} &
```

Do NOT pass `--port` unless the user specifies one — let the server pick a
free port. After the process starts, **re-read `{brain_path}/_meta/config.json`**
to get the actual `server_port` the server bound to. Use that port for the
health check and all subsequent API calls.

Then health-check to confirm it's up before continuing:

```bash
curl -s -X POST http://localhost:{actual_port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"health"}'
```

Verify the response includes `"brain_id"` matching this brain's id — this
confirms you're talking to the right server (not an unrelated brain on the
same machine).

### Step 8: Ingest the project

Invoke `wicked-brain:ingest` with:
- `brain_path`: `{brain_path}`
- `source`: the current working directory

This indexes the project files so the brain is immediately queryable.

### Step 9: Configure the CLI

Invoke `wicked-brain:configure` to write routing instructions into the active
CLI's agent config (CLAUDE.md, GEMINI.md, etc.). This is what makes the brain
the default for search and exploration — do not skip this step.

### Step 10: Confirm

Tell the user:
"Brain `{name}` is ready at `{brain_path}` — {N} files ingested, {M} chunks indexed.
CLI configured to route search and explore requests through the brain.

Run `wicked-brain:compile` to synthesize wiki articles from the indexed content."
