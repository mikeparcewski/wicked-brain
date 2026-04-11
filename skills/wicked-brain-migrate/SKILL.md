---
name: wicked-brain:migrate
description: |
  Migrate a flat brain at ~/.wicked-brain/ into the per-project layout at
  ~/.wicked-brain/projects/{name}/. Safe to run on already-migrated brains
  (no-op). Auto-invoked by wicked-brain:init when a flat brain is detected.

  Use when: "migrate my brain", "move brain to per-project layout",
  "I have an old ~/.wicked-brain brain", or when init detects a flat brain.
---

# wicked-brain:migrate

You migrate a flat brain (all data directly under `~/.wicked-brain/`) into the
per-project layout (each brain under `~/.wicked-brain/projects/{project-name}/`).
This was the layout change introduced in v0.4.7.

## Cross-Platform Notes

Commands in this skill work on macOS, Linux, and Windows. Prefer your native
Read/Write/Glob tools over shell commands when possible.

- macOS/Linux home: `~`
- Windows home: `%USERPROFILE%`

## When to use

- User explicitly asks to migrate
- `wicked-brain:init` detected a flat brain and invoked this skill
- Another skill hit errors caused by the flat layout (e.g. port collisions
  with a second project, meta-brain federation not working)

## Parameters

- **flat_path** (optional): path to the existing flat brain. Default: `~/.wicked-brain`
- **project_name** (optional): target project name. Default: asked interactively

## Multiple flat brains

This skill migrates **one** flat brain per invocation. If the user has several
flat brains in different locations (e.g. `~/.wicked-brain`, `~/work-brain`,
`~/.config/wicked-brain`), run `wicked-brain:migrate` once per source, passing
a different `flat_path` each time. Each becomes its own project brain — either
under the same `~/.wicked-brain/projects/` umbrella (recommended — pick
distinct project names) or under separate containers if the user prefers
isolation.

If the user asks "migrate all my brains," enumerate the flat brains you can
find first (`find ~ -maxdepth 3 -name brain.json 2>/dev/null` on macOS/Linux)
and confirm each with the user before running migration on it.

## Process

### Step 1: Detect what we're dealing with

Read `{flat_path}/brain.json` — if it does not exist, there is no flat brain
to migrate. Tell the user and stop.

Read `{flat_path}/brain.json` to get the brain's `id` and `name`. These become
the defaults for the target project.

Check whether `{flat_path}/projects/` already exists:

- **If `{flat_path}` looks like a pure container** (contains only a `projects/`
  subdirectory and optionally `_meta/`) — this brain is already migrated.
  Report "Already using per-project layout" and stop.

- **If `{flat_path}/brain.json` exists at the root AND `{flat_path}/projects/`
  also exists** — mixed state. This is a real migration case. Continue.

- **If `{flat_path}/brain.json` exists and no `projects/` subdir** — standard
  flat layout. Continue.

### Step 2: Confirm target with user

Ask the user:

1. "What should this project brain be called?" — Default: the `id` from
   `{flat_path}/brain.json`, or basename of the current working directory.
2. "Target path?" — Default: `{flat_path}/projects/{project_name}`

If the target directory already exists AND is non-empty, stop and tell the
user: "A brain already exists at the target path. Pick a different name or
remove the existing brain manually."

### Step 3: Stop any running server on the flat brain

**Critical on Windows** — SQLite's `.brain.db` may be locked by a running server
process. Moving a locked file silently corrupts the migration.

1. Read `{flat_path}/_meta/server.pid` if it exists.
2. Check if the process is alive:
   - macOS/Linux: `kill -0 {pid} 2>/dev/null`
   - Windows: `tasklist /FI "PID eq {pid}" 2>nul | findstr {pid}`
3. If alive, stop it:
   - macOS/Linux: `kill {pid}`
   - Windows PowerShell: `Stop-Process -Id {pid}`
4. Wait 2 seconds for file handles to release.
5. Delete the stale PID file.

Also look for any other wicked-brain-server processes targeting this flat path
and stop them. On macOS/Linux: `pgrep -f "wicked-brain-server.*{flat_path}"`.

### Step 4: Create the target directory structure

```bash
# macOS/Linux
mkdir -p {target_path}/_meta
```
```powershell
# Windows
New-Item -ItemType Directory -Force -Path "{target_path}\_meta"
```

Do NOT pre-create `raw/`, `chunks/`, `wiki/`, `memory/` — they'll be moved
over in Step 5.

### Step 5: Move data from flat to target

Move each of these directories/files from `{flat_path}` to `{target_path}`
(skip any that don't exist in the source):

- `brain.json`
- `raw/`
- `chunks/`
- `wiki/`
- `memory/`
- `.brain.db`
- `.brain.db-shm` (SQLite WAL shared memory, may not exist)
- `.brain.db-wal` (SQLite WAL log, may not exist)

macOS/Linux:
```bash
for item in brain.json raw chunks wiki memory .brain.db .brain.db-shm .brain.db-wal; do
  if [ -e "{flat_path}/$item" ]; then
    mv "{flat_path}/$item" "{target_path}/$item"
    echo "moved $item"
  fi
done
```

Windows PowerShell:
```powershell
$items = "brain.json","raw","chunks","wiki","memory",".brain.db",".brain.db-shm",".brain.db-wal"
foreach ($item in $items) {
  $src = Join-Path "{flat_path}" $item
  if (Test-Path $src) {
    Move-Item $src (Join-Path "{target_path}" $item)
    Write-Host "moved $item"
  }
}
```

**Do NOT move `_meta/`.** The flat brain's `_meta/config.json` references the
flat path and is about to be replaced. We'll write a fresh config in Step 6.

If the move fails partway through, stop immediately. Partial migrations leave
the brain in an unrecoverable state — tell the user what moved and what didn't,
and ask them to resolve manually before retrying.

### Step 6: Write the target's `_meta/config.json`

```json
{
  "brain_path": "{target_path}",
  "server_port": 4242,
  "installed_clis": []
}
```

`server_port: 4242` is the *preferred starting port*, not the guaranteed port.
When the server starts in Step 7 it probes from this value upward and writes
the actual bound port back to this same file. After Step 7, always re-read
`_meta/config.json` to get the real port — never hardcode `4242` in downstream
calls. This matters especially when migrating while another brain is already
running on 4242.

If the flat brain's `_meta/config.json` had a `source_path` field, copy it over
to the new config — the LSP workspace root must follow the brain.

Initialize the event log:
- macOS/Linux: `touch {target_path}/_meta/log.jsonl`
- Windows: `New-Item -ItemType File -Force -Path "{target_path}\_meta\log.jsonl"`

### Step 7: Start the server against the new path (verification before cleanup)

**Ordering matters.** Do not delete the flat `_meta/` yet — if the new server
fails to start, you need to be able to restore. Start and verify the new
server first; only clean up the flat path after verification succeeds.

Do NOT pass `--port` — let the server pick a free port. It will write the
actual port back to `{target_path}/_meta/config.json`.

```bash
npx wicked-brain-server --brain "{target_path}" &
```

Wait for the server to start, then re-read `{target_path}/_meta/config.json`
to get the bound port.

Health-check:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"health"}'
```

Verify the response includes `"brain_id"` matching the id from Step 1. If the
brain_id is different, the wrong server is responding — likely a stale process
on that port. Stop and diagnose before proceeding.

### Step 8: Verify the index still works

Run a stats call against the new server and confirm the document count is
non-zero (assuming the flat brain had any documents):

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"stats"}'
```

If document counts are zero but `.brain.db` was moved, the SQLite file may have
been truncated during the move or the server is looking at the wrong path.
**Do NOT proceed to Step 9.** Stop the new server and investigate — the flat
`_meta/` is still intact at this point, so you can roll back by moving files
back to `{flat_path}`.

### Step 9: Clean up the flat path (only after Steps 7 and 8 pass)

Do NOT run this step unless the health check AND stats check both succeeded.
This step is irreversible.

What's left at `{flat_path}` should now be:

- `_meta/` directory (old config, log, stale PID)
- Maybe a `projects/` subdirectory (if it existed before)

Verify this is the case before cleanup. If other files remain at the flat
path, stop and report them — they were not part of a standard flat brain and
the user needs to decide what to do with them.

Delete the flat `_meta/` directory:
- macOS/Linux: `rm -rf {flat_path}/_meta`
- Windows: `Remove-Item -Recurse -Force "{flat_path}\_meta"`

The flat path is now a pure container with only `projects/` beneath it.

### Step 10: Report

Tell the user:

"Migrated brain `{name}` from `{flat_path}` to `{target_path}`.
- {N} documents preserved
- Server running on port {port}
- `source_path`: {source_path or 'not set'}

The flat path `{flat_path}` is now a container for per-project brains. You can
create additional project brains under `{flat_path}/projects/` with `wicked-brain:init`."

## Rollback

If anything goes wrong before Step 9 (cleanup), the migration can be rolled
back by moving items back from `{target_path}` to `{flat_path}`. The flat
`_meta/` is still intact through Steps 1-8.

After Step 9 there is no clean rollback — the flat `_meta/` has been deleted.
Never run Step 9 until Steps 7 and 8 both pass.
