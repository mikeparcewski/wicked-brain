---
name: wicked-brain:forget
description: |
  Archive or delete a memory (or any indexed document) by id or path.
  Removes the document from the FTS index and renames the file with an
  `.archived-{timestamp}` suffix so the data is recoverable.

  Use when: "forget this memory", "archive this", "drop this decision",
  "remove from brain", "brain forget".
---

# wicked-brain:forget

Archive or hard-delete a memory by id or path. Wraps the server `remove` action
and the archive-rename convention used by wicked-brain:agent dispatch consolidate.

## Cross-Platform Notes

This skill uses `npx wicked-brain-call` for all server interaction. The CLI
works on macOS, Linux, and Windows; it discovers the brain, auto-starts the
server, and writes a per-call audit record under `{brain}/calls/`.

- Uses agent-native Read/Bash tools for file ops — no Unix-only shell features
- Paths always use forward slashes

## Config

Brain discovery + server lifecycle are handled by `wicked-brain-call`. Pass
`--brain <path>` to override the auto-detected brain, or set
`WICKED_BRAIN_PATH`. The CLI starts the server on first call (no manual
init required) and writes an audit record to `{brain}/calls/` per call.

## Parameters

- **id** (required if `path` not given): document id as returned by search
- **path** (required if `id` not given): path relative to the brain root (e.g. `memory/jwt-decision.md`)
- **mode** (optional, default `archive`): `archive` (rename file + remove from index, recoverable) or `delete` (rename + remove + final deletion is still left to the user — this skill never unlinks files)
- **reason** (optional): short string recorded in the log for auditability

This skill never hard-deletes a file. `delete` mode still renames with
`.archived-{timestamp}` — actual `rm` is a human decision.

## Process

### Step 1: Resolve id and path

If only `id` is given, find the path by calling search or reading the id (ids
are of the form `{path}` or `{path}::{fragment}` in this brain). If only `path`
is given, the id is normally the same string for top-level documents.

### Step 2: Confirm the document exists

Read the file at `{brain_path}/{path}` to verify it is present and (if it is a
memory) inspect its frontmatter so the log entry can record type/tier.

### Step 3: Remove from index

```bash
npx wicked-brain-call remove --param id={id}
```

### Step 4: Archive the file

Rename the file in-place with an `.archived-{unix-ms}` suffix.

macOS / Linux:
```bash
mv "{brain_path}/{path}" "{brain_path}/{path}.archived-$(date +%s)"
```

Windows (PowerShell):
```powershell
Rename-Item "{brain_path}/{path}" "{path}.archived-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
```

Prefer the agent-native Bash tool on the current platform; both forms produce a
recoverable archive marker.

### Step 5: Log the forget event

Append to `{brain_path}/_meta/log.jsonl`:

```json
{"ts":"{ISO}","op":"memory_forget","path":"{path}","id":"{id}","mode":"{mode}","reason":"{reason}","author":"agent:forget"}
```

### Step 6: Emit bus event

```bash
npx wicked-bus emit \
  --type "wicked.memory.archived" \
  --domain "wicked-brain" \
  --subdomain "brain.memory" \
  --payload '{"path":"{path}","id":"{id}","mode":"{mode}","reason":"{reason}"}' 2>/dev/null || true
```

Fire-and-forget — if the bus is not installed, silently skip.

### Step 7: Report

Report: path, id, previous frontmatter type/tier (if memory), archive filename,
and whether index removal succeeded. Always surface the archive path so the
user can restore it by renaming back.

## Recovery

To restore an archived memory, rename the `.archived-{ts}` file back to its
original name. The file watcher will pick it up and re-index automatically.
