---
name: wicked-brain:lsp
description: |
  Universal code intelligence via LSP. Queries language servers for definitions,
  references, symbols, call hierarchies, hover info, and diagnostics. Auto-installs
  language servers when missing.

  Use when: "where is X defined", "who uses X", "what type is X",
  "list symbols in", "find symbol", "who calls X", "blast radius",
  "architecture map", "code diagnostics", "lsp health".
---

# wicked-brain:lsp

Universal code intelligence for any CLI/IDE via the brain's LSP client layer.

## Cross-Platform Notes

Commands in this skill work on macOS, Linux, and Windows. When a command has
platform differences, alternatives are shown. Your native tools (Read, Write,
Grep, Glob) work everywhere — prefer them over shell commands when possible.

For the brain path default:
- macOS/Linux: ~/.wicked-brain
- Windows: %USERPROFILE%\.wicked-brain

- `curl` works on macOS, Linux, and Windows 10+
- File paths must be absolute
- On Windows, use forward slashes in file URIs passed to the server. Most LSP
  servers accept `file:///C:/Users/me/project/file.ts` (forward slashes, three
  leading slashes). Do not use backslashes in URIs even on Windows.
- Language server install commands assume the package manager is in PATH
- For Windows PowerShell without npm/pip in PATH, guide the user to install manually

**Debugging LSP issues:** If an LSP server appears to hang or returns no
results on the first request, it may require a workspace initialization
sequence before accepting queries. Try calling `lsp-health` first — the server
layer sends an `initialize` handshake on first contact. If hang persists, check
whether the language server process is running and review its stderr logs.

## Config

Read `_meta/config.json` for brain path and server port.
If it doesn't exist, trigger wicked-brain:init.

## Prerequisites — Source Path

**LSP operates on the source project, not the brain directory.** The server must know where the ingested project lives to initialize language servers correctly. Without this, LSP calls will fail with "No Project" errors or return empty results.

### Check if source_path is configured

Read `{brain_path}/_meta/config.json`. Look for a `source_path` key:

```json
{
  "brain_path": "/Users/me/.wicked-brain",
  "server_port": 4243,
  "source_path": "/Users/me/Projects/my-project"
}
```

If `source_path` is **present** — LSP is configured. Proceed with calls.

If `source_path` is **missing** — LSP will fail. Fix it before continuing.

### Fix: set source_path

**Option A** — Re-ingest the project directory (recommended, sets source_path automatically):
```
wicked-brain:ingest source=/path/to/project
```

**Option B** — Write it manually to `_meta/config.json`, then restart the server:
```bash
# Read current config, add source_path, write back
python3 -c "
import json
path = '{brain_path}/_meta/config.json'
with open(path) as f: cfg = json.load(f)
cfg['source_path'] = '/absolute/path/to/project'
with open(path, 'w') as f: json.dump(cfg, f, indent=2)
print('source_path set')
" 2>/dev/null || python -c "
import json
path = '{brain_path}/_meta/config.json'
with open(path) as f: cfg = json.load(f)
cfg['source_path'] = '/absolute/path/to/project'
with open(path, 'w') as f: json.dump(cfg, f, indent=2)
print('source_path set')
"
# Then restart the server with --source:
npx wicked-brain-server --brain {brain_path} --port {port} --source /absolute/path/to/project &
```

**Option C** — Restart server with `--source` flag (does not persist to config):
```bash
npx wicked-brain-server --brain {brain_path} --port {port} --source /absolute/path/to/project &
```

Wait 2 seconds after restarting, then verify with `lsp-health`.

### Diagnosing "No Project" / empty results

Symptoms that indicate missing or wrong `source_path`:
- `lsp-workspace-symbols` returns `{"symbols":[]}` for any query
- `lsp-health` shows `{"typescript":{"status":"error","message":"No Project"}}` or similar
- Any LSP call returns an error about workspace or project not found

Check `source_path` in config. If it points at the brain directory (e.g., `~/.wicked-brain/...`) instead of the source project, that is wrong — the brain dir has no `tsconfig.json` or language config. Set it to the project root and restart.

## When to Use

| You want to... | Action | Example |
|----------------|--------|---------|
| Find where something is defined | `lsp-definition` | "Where is UserService defined?" |
| Find all usages of something | `lsp-references` | "Who uses the validateCredentials function?" |
| See what type something is | `lsp-hover` | "What's the type of this variable?" |
| List symbols in a file | `lsp-symbols` | "What classes and functions are in auth/login.ts?" |
| Find a symbol by name | `lsp-workspace-symbols` | "Find the class PaymentService" |
| See what implements an interface | `lsp-implementation` | "What classes implement AuthProvider?" |
| Find who calls a function | `lsp-call-hierarchy-in` | "Who calls processPayment?" |
| See what a function calls | `lsp-call-hierarchy-out` | "What does processPayment call?" |
| Check for errors | `lsp-diagnostics` | "Any type errors in this project?" |
| Analyze blast radius | `lsp-call-hierarchy-in` (recursive) | "What breaks if I change handleRequest?" |
| Map architecture | `lsp-workspace-symbols` + `lsp-symbols` | "Give me an overview of this codebase" |
| Check server status | `lsp-health` | "Are language servers running?" |

## Process

### Step 1: Identify the action

Based on what the user/agent needs, pick the appropriate action from the table above.

### Step 2: Call the server

```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"{action}","params":{params}}'
```

**Position-based actions** (definition, references, hover, implementation, call-hierarchy):
```json
{"action":"lsp-definition","params":{"file":"/absolute/path/to/file.ts","line":15,"col":10}}
```
Note: `line` and `col` are 0-indexed.

**File-based actions** (symbols):
```json
{"action":"lsp-symbols","params":{"file":"/absolute/path/to/file.ts"}}
```

**Query-based actions** (workspace-symbols):
```json
{"action":"lsp-workspace-symbols","params":{"query":"PaymentService"}}
```

**No-params actions** (health, diagnostics without file):
```json
{"action":"lsp-health"}
{"action":"lsp-diagnostics"}
```

### Step 3: Handle errors — auto-install

If the response contains `"error": "language_server_not_found"`, the language server isn't installed. The response includes install instructions:

```json
{"error":"language_server_not_found","language":"typescript","install":{"method":"npm","package":"typescript-language-server typescript"}}
```

Attempt installation based on the method:

| Method | Command |
|--------|---------|
| npm | `npm install -g {package}` |
| pip | `pip install {package} 2>/dev/null \|\| pip3 install {package}` |
| cargo | `cargo install {package}` |
| gem | `gem install {package}` |
| go | `go install {package}@latest` |
| brew | `brew install {package}` |
| dotnet | `dotnet tool install -g {package}` |
| rustup | `rustup component add {package}` |
| manual | Tell the user: "Install {package} manually" |

After installation, retry the original LSP request.

If installation fails, report to the user:
"Could not auto-install {language} language server. Install manually: {instructions}"

### Step 4: Handle other errors

| Error | What to do |
|-------|-----------|
| `language_server_crashed` | The server crashed 3 times. Report to user, suggest checking the language server logs. |
| `unsupported_language` | No known language server for this file extension. |
| `lsp_timeout` | The language server took too long. May be initializing a large project. Retry once. |
| `file_outside_workspace` | The file isn't under `source_path`. Check `_meta/config.json` — `source_path` must be the project root that contains the file. Set it and restart the server with `--source`. |

### Step 5: Use results

**Definitions/References/Implementation** return locations:
```json
{"locations":[{"file":"/path/to/file.ts","line":15,"col":2}]}
```
Read the file at that location to show the user the relevant code.

**Symbols** return a hierarchy:
```json
{"symbols":[{"name":"UserService","kind":"class","line":15,"endLine":45,"children":[...]}]}
```
Useful for understanding file structure.

**Hover** returns type info:
```json
{"content":"(method) UserService.validate(token: string): boolean","language":"typescript"}
```

**Call hierarchy** returns call chains:
```json
{"calls":[{"from":{"name":"handleLogin","file":"/path/auth.ts","line":30}}]}
```

**Diagnostics** return errors/warnings:
```json
{"diagnostics":[{"line":23,"col":5,"severity":"error","message":"Type 'string' is not assignable to type 'number'"}],"errors":1,"warnings":0}
```

## Blast Radius Analysis

To analyze the blast radius of changing a function:

1. Call `lsp-call-hierarchy-in` for the function → get direct callers
2. For each caller, call `lsp-call-hierarchy-in` again → get indirect callers
3. Continue until the chain stabilizes (usually 2-3 levels)
4. Report the full call chain with file locations

## Architecture Mapping

To map a codebase's architecture:

1. Call `lsp-workspace-symbols` with query="" to get all symbols
2. For key files (entry points, main modules), call `lsp-symbols` for detailed hierarchies
3. Combine with brain's existing wikilinks and backlinks for a complete picture
4. Use `wicked-brain:compile` to synthesize into a wiki article
