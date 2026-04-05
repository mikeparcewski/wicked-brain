---
name: wicked-brain:server
description: |
  Manages the wicked-brain background server. Auto-triggered when any brain skill
  gets a connection error. Starts the server, checks health, and reports status.
  Users should never need to invoke this directly.
---

# wicked-brain:server

You manage the wicked-brain background server. This skill is triggered automatically
when another brain skill cannot reach the server.

## Cross-Platform Notes

Commands in this skill work on macOS, Linux, and Windows. When a command has
platform differences, alternatives are shown. Your native tools (Read, Write,
Grep, Glob) work everywhere — prefer them over shell commands when possible.

For the brain path default:
- macOS/Linux: ~/.wicked-brain
- Windows: %USERPROFILE%\.wicked-brain

## When to use

- When a brain skill reports "connection refused" or similar error from curl
- When asked to check or restart the brain server

## Server check and start

1. Read the file at `{brain_path}/_meta/config.json` to get the port and brain path.

2. Try a health check:
   ```bash
   curl -s -f -X POST http://localhost:{port}/api \
     -H "Content-Type: application/json" \
     -d '{"action":"health","params":{}}'
   ```

3. If the health check succeeds, the server is running. Report the status.

4. If connection refused:
   a. Read the file at `{brain_path}/_meta/server.pid` to get the PID.

   b. Check if the process is running:
      - macOS/Linux: `kill -0 {pid} 2>/dev/null`
      - Windows: `tasklist /FI "PID eq {pid}" 2>nul | findstr {pid}`
      - Or use Python: `python3 -c "import os; os.kill({pid}, 0)" 2>/dev/null || python -c "import os; os.kill({pid}, 0)"`

   c. If the process is dead or no PID file, start the server:
      ```bash
      npx wicked-brain-server --brain {brain_path} --port {port} &
      ```
      On Windows (PowerShell): `Start-Process npx -ArgumentList "wicked-brain-server","--brain","{brain_path}","--port","{port}" -NoNewWindow`

   d. Wait 2 seconds, then retry the health check.
   e. If still failing, tell the user:
      "The brain server couldn't start automatically. Please run:
       `npx wicked-brain-server --brain {brain_path} --port {port}`"

## API pattern for other skills

All skills that need the server should use this curl pattern:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"{action}","params":{params_json}}'
```

`curl` works on macOS, Linux, and Windows 10+ (ships by default). If curl fails
with connection refused, trigger this wicked-brain:server skill.
