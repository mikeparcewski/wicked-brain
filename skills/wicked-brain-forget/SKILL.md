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

- Uses `curl` for server API calls (Windows 10+, macOS, Linux)
- Uses agent-native Read/Bash tools for file ops — no Unix-only shell features
- Paths always use forward slashes

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
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"remove","params":{"id":"{id}"}}'
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

### Step 6: Report

Report: path, id, previous frontmatter type/tier (if memory), archive filename,
and whether index removal succeeded. Always surface the archive path so the
user can restore it by renaming back.

## Recovery

To restore an archived memory, rename the `.archived-{ts}` file back to its
original name. The file watcher will pick it up and re-index automatically.
