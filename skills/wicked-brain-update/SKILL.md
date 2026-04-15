---
name: wicked-brain:update
description: |
  Check for and install wicked-brain updates. Compares installed version against
  npm registry, updates skills across all detected CLIs, and updates the server.
  
  Use when: "update wicked-brain", "check for brain updates", "wicked-brain:update",
  or periodically to stay current.
---

# wicked-brain:update

You check for and install updates to the wicked-brain skills and server.

## Cross-Platform Notes

Commands in this skill work on macOS, Linux, and Windows. When a command has
platform differences, alternatives are shown. Your native tools (Read, Write,
Grep, Glob) work everywhere — prefer them over shell commands when possible.

For the brain path default:
- macOS/Linux: ~/.wicked-brain
- Windows: %USERPROFILE%\.wicked-brain

## When to use

- User asks to update or check for updates
- Periodically (suggest checking monthly)
- After encountering unexpected behavior that might be fixed in a newer version

## Process

### Step 1: Check current installed version

The `wicked-brain-server` binary lives inside the globally installed `wicked-brain` npm package. Read its version directly from the installed package:

```bash
npm list -g wicked-brain --json 2>/dev/null | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    deps = d.get('dependencies', {})
    v = deps.get('wicked-brain', {}).get('version', 'not installed')
    print(v)
except Exception:
    print('not installed')
" 2>/dev/null || npm list -g wicked-brain --json 2>/dev/null | python -c "
import json, sys
try:
    d = json.load(sys.stdin)
    deps = d.get('dependencies', {})
    v = deps.get('wicked-brain', {}).get('version', 'not installed')
    print(v)
except Exception:
    print('not installed')
"
```

If the result is `not installed`, the package was never globally installed (the
user may have been running via `npx` only). Treat this as "needs install" and
proceed to Step 4.

`wicked-brain-server --version` (v0.8.0+) prints the installed version directly.
It's safe to call the binary by its installed path — e.g.
`$(npm config get prefix)/bin/wicked-brain-server --version`. **Avoid
`npx wicked-brain-server --version`** — npx may resolve to a cached copy that
isn't the globally installed one that actually runs when brain servers start,
so the number it reports can lie about what will serve requests.

### Step 2: Check latest version on npm

```bash
npm view wicked-brain version 2>/dev/null
```

### Step 3: Compare versions

If the installed version matches the latest, report:
"wicked-brain is up to date (v{version})."

If an update is available, ask the user:
"wicked-brain v{new} is available (you have v{current}). Update now?"

### Step 4: Update (if user approves)

**Critical:** `npx wicked-brain@latest` only runs the *installer* — it refreshes
the skill markdown files in your CLI's skills directory, but it does NOT update
the globally installed `wicked-brain-server` binary. The skills will then expect
features that the old server doesn't have, producing confusing errors.

Use `npm install -g` to update the actual binary:

```bash
npm install -g wicked-brain@latest 2>&1
```

On Windows PowerShell (no change needed):
```powershell
npm install -g wicked-brain@latest
```

If this fails with `EACCES` / permission denied:
- macOS/Linux: `sudo npm install -g wicked-brain@latest`
- Windows: re-run the shell as Administrator, or fix npm's global prefix per
  npm docs. Do NOT silently skip — report the failure to the user and stop.

After a successful `npm install -g`, also run the installer to refresh skill
files in all detected CLIs (skills are copied from the installed package, not
downloaded separately):

```bash
npx wicked-brain
```

### Step 4a: Verify the update landed

Re-run the Step 1 version check. The version reported MUST match the latest
version from Step 2. If it still shows the old version:

1. Check `which wicked-brain-server` (macOS/Linux) or `where wicked-brain-server` (Windows) — the shell may have cached a path to a different installation.
2. Clear npm's global cache: `npm cache clean --force`
3. Check if a different Node.js version (nvm, fnm, volta) is pinning a stale copy.

Do NOT proceed to Step 5 until version verification succeeds. Reporting a successful update while the binary is stale is the top failure mode of this skill.

### Step 5: Restart server if running

**IMPORTANT:** After updating, any running brain server must be restarted to pick up
new server code (schema migrations, new actions, updated search scoring). Failing to
restart means the old code serves requests even though skills expect new features.

Check if a brain server is running and restart it to pick up changes.

Find running server PIDs by searching for `server.pid` files under `_meta/` directories
in the home directory. Use your Glob tool if available.

On macOS/Linux:
```bash
find ~ -name "server.pid" -path "*/_meta/*" 2>/dev/null
```
On Windows (PowerShell):
```powershell
Get-ChildItem -Recurse -Filter "server.pid" -Path $env:USERPROFILE -ErrorAction SilentlyContinue | Where-Object { $_.DirectoryName -match "_meta" }
```

For each pid file found:
1. Read the file to get the PID.
2. Check if the process is alive:
   - macOS/Linux: `kill -0 {pid} 2>/dev/null`
   - Windows: `tasklist /FI "PID eq {pid}" 2>nul | findstr {pid}`
   - Or Python: `python3 -c "import os; os.kill({pid}, 0)" 2>/dev/null || python -c "import os; os.kill({pid}, 0)"`
3. If alive, stop it:
   - macOS/Linux: `kill {pid}`
   - Windows: `Stop-Process -Id {pid}`
4. Read `{brain_dir}/_meta/config.json` to get the port.
5. Restart: `npx wicked-brain-server --brain "{brain_dir}" --port {port}`
   On Windows: `Start-Process npx -ArgumentList "wicked-brain-server","--brain","{brain_dir}","--port","{port}" -NoNewWindow`

### Step 6: Verify migration

`npx wicked-brain-server` automatically applies all pending schema migrations on
startup — users do not need to run a separate migration command. Each new server
version may add tables or columns to the SQLite database; migrations are numbered,
run in order, and are idempotent (safe to re-run).

After server restart, verify the server started successfully and migrations ran:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"health"}'
```

If the health check fails, the migration may have errored. To diagnose:
1. Check whether the server process is actually running:
   - Read `{brain_path}/_meta/server.pid` to get the PID.
   - macOS/Linux: `ps -p {pid}` — if the process is absent, the server crashed on startup.
   - Windows: `tasklist /FI "PID eq {pid}"`
2. The server logs migration errors to **stderr**. If you launched it in the
   foreground, the error will be visible in the terminal. If launched in the
   background, redirect stderr to a file:
   `npx wicked-brain-server --brain "{brain_path}" --port {port} 2>{brain_path}/_meta/server-error.log`
   then read `{brain_path}/_meta/server-error.log`.
3. Common causes: the SQLite file is locked by another process, or the database
   file is corrupted. Stop all server instances and retry, or delete `.brain.db`
   to force a clean rebuild (data is re-indexed from source files on next ingest).

### Step 7: Report

Tell the user what was updated:
- Server: v{old} -> v{new}
- Skills: updated in {N} CLIs
- Running servers: {N} restarted
- Schema: migrated to version {N} (check via health endpoint)

## Version check without updating

If the user just wants to check (not update), stop after Step 3 and report
the current vs. available version.
