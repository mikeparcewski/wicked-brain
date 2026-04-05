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

## When to use

- User asks to update or check for updates
- Periodically (suggest checking monthly)
- After encountering unexpected behavior that might be fixed in a newer version

## Process

### Step 1: Check current version

Read the installed server version:
```bash
fs-brain-server --version 2>/dev/null || npx fs-brain-server --version 2>/dev/null || echo "not installed"
```

If that doesn't work, check the package directly:
```bash
npm list -g fs-brain-server --json 2>/dev/null | grep version
```

### Step 2: Check latest version on npm

```bash
npm view wicked-brain version 2>/dev/null || npm view fs-brain-server version 2>/dev/null
```

### Step 3: Compare versions

If the installed version matches the latest, report:
"wicked-brain is up to date (v{version})."

If an update is available, ask the user:
"wicked-brain v{new} is available (you have v{current}). Update now?"

### Step 4: Update (if user approves)

#### Update server
```bash
npm install -g fs-brain-server@latest
```

#### Update skills

Find where wicked-brain skills are installed and update them:

```bash
# Check each CLI's skills directory
for dir in ~/.claude/skills ~/.gemini/skills ~/.github/skills ~/.codex/skills ~/.cursor/skills; do
  if [ -d "$dir/wicked-brain-init" ]; then
    echo "Updating skills in $dir..."
    npx wicked-brain --cli=$(basename $(dirname $dir))
  fi
done
```

Or run the installer directly which handles detection:
```bash
npx wicked-brain@latest
```

### Step 5: Restart server if running

Check if a brain server is running and restart it to pick up changes:

```bash
# Find running server PIDs
for pid_file in $(find ~ -name "server.pid" -path "*/_meta/*" 2>/dev/null); do
  brain_dir=$(dirname $(dirname "$pid_file"))
  pid=$(cat "$pid_file" 2>/dev/null)
  if kill -0 "$pid" 2>/dev/null; then
    echo "Restarting server for brain at $brain_dir..."
    kill "$pid"
    sleep 1
    config=$(cat "$brain_dir/_meta/config.json" 2>/dev/null)
    port=$(echo "$config" | grep -o '"server_port":[0-9]*' | grep -o '[0-9]*')
    fs-brain-server --brain "$brain_dir" --port "${port:-4242}" &
  fi
done
```

### Step 6: Report

Tell the user what was updated:
- Server: v{old} -> v{new}
- Skills: updated in {N} CLIs
- Running servers: {N} restarted

## Version check without updating

If the user just wants to check (not update), stop after Step 3 and report
the current vs. available version.
