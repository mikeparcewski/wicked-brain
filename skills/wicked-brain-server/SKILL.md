---
name: wicked-brain:server
description: |
  Manages the fs-brain background server. Auto-triggered when any brain skill
  gets a connection error. Starts the server, checks health, and reports status.
  Users should never need to invoke this directly.
---

# wicked-brain:server

You manage the fs-brain background server. This skill is triggered automatically
when another brain skill cannot reach the server.

## When to use

- When a brain skill reports "connection refused" or similar error from curl
- When asked to check or restart the brain server

## Server check and start

1. Read `_meta/config.json` from the brain directory to get the port and brain path:
   ```bash
   cat {brain_path}/_meta/config.json
   ```

2. Try a health check:
   ```bash
   curl -s -f -X POST http://localhost:{port}/api \
     -H "Content-Type: application/json" \
     -d '{"action":"health","params":{}}'
   ```

3. If the health check succeeds, the server is running. Report the status.

4. If connection refused:
   a. Check if a PID file exists and the process is alive:
      ```bash
      cat {brain_path}/_meta/server.pid 2>/dev/null && kill -0 $(cat {brain_path}/_meta/server.pid) 2>/dev/null
      ```
   b. If the process is dead or no PID file, start the server:
      ```bash
      npx fs-brain-server --brain {brain_path} --port {port} &
      ```
   c. Wait 2 seconds, then retry the health check.
   d. If still failing, tell the user:
      "The brain server couldn't start automatically. Please run:
       `! npx fs-brain-server --brain {brain_path} --port {port}`"

## API pattern for other skills

All skills that need the server should use this curl pattern:

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"{action}","params":{params_json}}'
```

If the curl fails with connection refused, trigger this wicked-brain:server skill.
