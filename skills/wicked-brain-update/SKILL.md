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

### Step 1: Check current version

Read the installed server version:
```bash
wicked-brain-server --version 2>/dev/null || npx wicked-brain-server --version 2>/dev/null || echo "not installed"
```

If that doesn't work, check the package directly:
```bash
npm list -g wicked-brain-server --json 2>/dev/null | grep version
```

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

#### Update everything (skills + server)

The server is bundled in the main package — one command updates both:

```bash
npx wicked-brain@latest
```

This re-runs the installer with the latest version, updating all skills across detected CLIs. The server binary updates automatically since it's part of the same package.

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

After server restart, verify the server started successfully and migrations ran:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"health"}'
```

If health check fails, check server logs for migration errors. The server runs
numbered schema migrations on startup — each new version may add tables or columns
to the SQLite database. Migrations are automatic and idempotent.

### Step 7: Report

Tell the user what was updated:
- Server: v{old} -> v{new}
- Skills: updated in {N} CLIs
- Running servers: {N} restarted
- Schema: migrated to version {N} (check via health endpoint)

## Version check without updating

If the user just wants to check (not update), stop after Step 3 and report
the current vs. available version.
