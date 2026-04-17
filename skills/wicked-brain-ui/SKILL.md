---
name: wicked-brain:ui
description: |
  Open the read-only brain viewer (Material-styled search + wiki browser) in
  the default web browser. Use when the user says "open the brain viewer",
  "show me the wiki", "open the brain in a browser", "open the UI",
  "launch the viewer", or similar. Also use when the user wants to explore
  a specific doc visually rather than through search tool calls — the URL
  supports deep-linking via `#<path>`.

  Works against any wicked-brain server on the local machine. If the server
  isn't running, auto-starts it before opening.
---

# wicked-brain:ui

You open the read-only HTML viewer served at `GET /` by the wicked-brain
server for the current project's brain (or a named brain).

## Cross-Platform Notes

The only platform-specific piece is the "open a URL in the default browser"
command. Everything else is curl + Read/Write. Fallbacks are provided for all
three major platforms.

For the brain path default:
- macOS/Linux: `~/.wicked-brain/projects/{project-name}`
- Windows: `%USERPROFILE%\.wicked-brain\projects\{project-name}`

## Parameters

- **brain** (optional): brain id or absolute brain path. Defaults to the
  current working directory's project brain (per the resolution in
  wicked-brain:init § "Resolving the brain config").
- **path** (optional): a repo-relative doc path to deep-link to
  (e.g., `wiki/projects/foo/engineering.md`). The viewer loads this
  document on open via URL fragment.

## Process

### Step 1: Resolve brain config

Use the shared resolution in wicked-brain:init § "Resolving the brain config".
In short: try
`~/.wicked-brain/projects/{cwd_basename}/_meta/config.json` first, fall back
to `~/.wicked-brain/_meta/config.json`, else trigger wicked-brain:init.

If `brain` was supplied explicitly, use that instead:
- If it looks like a path (contains `/` or starts with `~`), expand and use.
- Otherwise, treat it as a brain id and look for
  `~/.wicked-brain/projects/{brain}/_meta/config.json`.

Read the resolved config to get `server_port`.

### Step 2: Verify the server is running

```bash
curl -s -f -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"health","params":{}}'
```

If the call fails with connection refused, invoke the wicked-brain:server
auto-start pattern — start the server against the resolved brain path and
wait for health to return ok before continuing. Never open a browser at a
URL that isn't serving yet; that produces a scary "can't connect" page the
user then has to refresh.

### Step 3: Build the URL

Base: `http://localhost:{port}/`

If `path` was supplied, append `#{url-encoded path}`:

```
http://localhost:4245/#wiki%2Fprojects%2Fgcp-repo-analyzer%2Fengineering.md
```

### Step 4: Open in the default browser

macOS:
```bash
open "{url}"
```

Linux:
```bash
xdg-open "{url}" 2>/dev/null || sensible-browser "{url}" 2>/dev/null || echo "Open manually: {url}"
```

Windows (PowerShell):
```powershell
Start-Process "{url}"
```

Windows (Git Bash / WSL):
```bash
start "" "{url}" 2>/dev/null || explorer.exe "{url}" 2>/dev/null || echo "Open manually: {url}"
```

If opening the browser fails (no DISPLAY on a headless server, no xdg-utils
installed, etc.), don't treat it as fatal — just print the URL and tell the
user to open it themselves. The URL is the deliverable.

### Step 5: Report

Tell the user:

> Opened the brain viewer at `{url}`.
>
> It supports:
> - Search across all indexed docs (AppBar input)
> - Source-type filters (wiki / chunk / memory) in the left drawer
> - Wiki article browser in the left drawer
> - Deep-linking via URL fragment (`#<path>`)
> - Back button to return from doc view to results

If the server had to be auto-started, mention that in the report so the user
knows a new process is running.

## When to use

- User explicitly asks to open the viewer / UI / browser / wiki.
- User wants to visually explore a doc they've been working with — offer to
  open it with the `path` param pre-filled.
- User asks "what's in the brain?" in an exploratory way — a visual browser
  is often faster than a sequence of search calls.

## When NOT to use

- When the user wants a specific answer from the brain: use
  wicked-brain:search or wicked-brain:query instead. Opening a browser is
  higher friction than a tool call with a direct answer.
- When a remote / headless environment: no browser is available. Just print
  the URL so the user can forward it.
- When multiple brains could be relevant: ask which one first rather than
  guessing, so you don't open the wrong brain's viewer.
