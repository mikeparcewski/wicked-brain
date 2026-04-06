---
name: wicked-brain:batch
description: |
  Pattern for batch operations that would otherwise fill context with repetitive
  tool calls. Detects the available runtime (Node, Python, shell), writes a
  script, runs it, and reports results. Used internally by other skills.
  
  Use when: any brain operation needs to process more than 5 files, run more
  than 10 API calls, or would otherwise burn context on repetitive operations.
---

# wicked-brain:batch

You handle batch operations efficiently by generating and running scripts instead
of executing repetitive tool calls inline.

## When to use

- Ingesting a directory of files (wicked-brain:ingest calls you)
- Reindexing all content (wicked-brain:lint or rebuild)
- Bulk search across many terms
- Any operation touching more than 5 files

## Why scripts over tool calls

| Approach | Context cost | Speed | Reliability |
|---|---|---|---|
| 50 Read + 50 Write + 50 Bash (curl) | ~150 tool calls, floods context | Slow (round-trips) | Error-prone (partial failures) |
| Write 1 script + Run 1 script + Read output | ~3 tool calls | Fast (single process) | Script handles errors internally |

## Process

### Step 1: Detect runtime

Check what's available, in preference order:

```bash
node --version 2>/dev/null && echo "node" || python3 --version 2>/dev/null && echo "python3" || python --version 2>/dev/null && echo "python" || echo "shell"
```

Prefer Node.js (since wicked-brain-server requires it, it's always available).

### Step 2: Write the script

Write to `{brain_path}/_meta/batch-{operation}.mjs` (or `.py` or `.sh`).

The script must:
1. Accept the brain path, server port, and operation-specific params
2. Do all the work (walk dirs, read files, write chunks, curl APIs)
3. Log progress to stdout (one line per file processed)
4. Handle errors per-file (don't stop on one failure)
5. Print a summary at the end

### Step 3: Run the script

```bash
node {brain_path}/_meta/batch-{operation}.mjs
```

### Step 4: Read output and report

Read the script's stdout. Summarize results to the user.

### Step 5: Clean up

Optionally delete the script after successful completion:
```bash
rm {brain_path}/_meta/batch-{operation}.mjs
```

Or keep it for re-runs — the user can run it manually too.

## Cross-Platform Notes

- Node.js scripts are fully cross-platform (same code on macOS/Linux/Windows)
- Python scripts are fully cross-platform
- Shell scripts need macOS/Linux + Windows variants — avoid if Node or Python available
- Use `fetch()` (Node 18+) instead of `curl` in scripts — it's native and cross-platform
- Use `node:fs` and `node:path` — they handle platform differences

## Template: Node.js batch script

See wicked-brain:ingest for a complete example. The key structure:

```javascript
#!/usr/bin/env node
import { ... } from "node:fs";
import { ... } from "node:path";

const BRAIN = "{brain_path}";
const PORT = {port};

// Walk, process, index, report
```

## Template: Python batch script

```python
#!/usr/bin/env python3
import os, json, hashlib, urllib.request

BRAIN = "{brain_path}"
PORT = {port}

def api(action, params):
    data = json.dumps({"action": action, "params": params}).encode()
    req = urllib.request.Request(f"http://localhost:{PORT}/api",
        data=data, headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

# Walk, process, index, report
```
