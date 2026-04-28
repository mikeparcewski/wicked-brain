---
name: wicked-brain:server
description: |
  Manages the wicked-brain background server. Most callers should use
  `wicked-brain-call` directly — it auto-starts the server. This skill is
  for explicit lifecycle management: start, stop, status, or recovery from
  a stuck process.
---

# wicked-brain:server

Manage the wicked-brain background server lifecycle explicitly. **Most skills
do not need this** — `npx wicked-brain-call <action>` will spawn the server
on first call (lock-guarded against races) and reuse it thereafter.

## Cross-Platform Notes

This skill uses `npx wicked-brain-call` for all server interaction. The CLI
works on macOS, Linux, and Windows; it discovers the brain, auto-starts the
server, and writes a per-call audit record under `{brain}/calls/`.

For the brain path default:
- macOS/Linux: `~/.wicked-brain/projects/{cwd_basename}`
- Windows: `%USERPROFILE%\.wicked-brain\projects\{cwd_basename}`

## Config

Brain discovery + server lifecycle are handled by `wicked-brain-call`. Pass
`--brain <path>` to override the auto-detected brain, or set
`WICKED_BRAIN_PATH`. The CLI starts the server on first call (no manual
init required) and writes an audit record to `{brain}/calls/` per call.

## When to use

- Explicitly start, stop, or check the server (rare — `wicked-brain-call`
  handles this for you on every call)
- Recover from a stuck or stale server process

## Canonical commands

```bash
npx wicked-brain-call --status [--brain {brain_path}]
npx wicked-brain-call --start  [--brain {brain_path}]
npx wicked-brain-call --stop   [--brain {brain_path}]
```

`--status` reports whether a live server is answering on the configured port,
the bound port, and the brain id. `--start` spawns the server (idempotent —
no-op if already running). `--stop` signals the recorded PID and clears the
PID file.

If the user reports "the brain server seems wedged":

1. `npx wicked-brain-call --status --brain {brain_path}` to confirm.
2. `npx wicked-brain-call --stop --brain {brain_path}` to terminate.
3. `npx wicked-brain-call --start --brain {brain_path}` to relaunch.
4. `npx wicked-brain-call health --brain {brain_path}` to verify.

## API pattern for other skills

All skills should call the server through `wicked-brain-call`:

```bash
npx wicked-brain-call <action>                                 # no params
npx wicked-brain-call <action> --param key=value [--param ...] # simple params
npx wicked-brain-call <action> '{"k":"v","nested":[1,2]}'      # complex JSON
echo '{"k":"v"}' | npx wicked-brain-call <action> -            # stdin (kubectl-style)
```

Exit codes: `0` = ok, `1` = API returned an error, `2` = infra failure
(server unreachable or could not be spawned).
