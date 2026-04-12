---
name: wicked-brain:configure
description: Read brain state and write contextual instructions into the active CLI's agent config file. Run after onboarding, major ingests, or consolidation.
---

# wicked-brain:configure

Writes a contextual `## wicked-brain` section into the active CLI/IDE's agent config file.

## Config

Resolve the brain config via the shared resolution in
wicked-brain:init § "Resolving the brain config". In short: try
`~/.wicked-brain/projects/{cwd_basename}/_meta/config.json` first, fall back
to `~/.wicked-brain/_meta/config.json` (legacy flat), else trigger
wicked-brain:init. Read the resolved file for brain path and server port.

Do NOT read a bare relative `_meta/config.json` — the model will resolve it
against the current working directory and brain files will end up in the
project root.

## Process

### Step 1: Gather brain state

1. Call server stats:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"stats"}'
```

2. Search for top topics — run a broad search to identify dominant tags:
```bash
curl -s -X POST http://localhost:{port}/api \
  -H "Content-Type: application/json" \
  -d '{"action":"search","params":{"query":"*","limit":50}}'
```
Read frontmatter of top results, count `contains:` tag frequency. Top 10 tags = brain expertise.

3. Read `{brain_path}/brain.json` for brain identity and linked brains.

4. Read `{brain_path}/_meta/log.jsonl` (last 50 lines) for recent `search_miss` entries — these are knowledge gaps.

5. List available agents by reading `skills/wicked-brain-agent/agents/` at depth 0.

### Step 2: Detect CLI/IDE

Check for these signals in order (first match wins):

| Signal | Platform | Config File |
|--------|----------|------------|
| `CLAUDE_CODE` env var or `.claude/` exists | Claude Code | `CLAUDE.md` |
| `CODEX_CLI` env var or `.codex/` exists | Codex | `.codex/instructions.md` |
| `.kiro/` exists | Kiro | `KIRO.md` |
| `GEMINI_CLI` env var or `.gemini/` exists | Gemini CLI | `GEMINI.md` |
| `COPILOT_CLI` env var or `.github/` exists | Copilot CLI | `.github/copilot-instructions.md` |
| `.cursor/` exists | Cursor | `.cursor/rules/wicked-brain.md` |
| `.antigravity/` exists | Antigravity | `.antigravity/rules/wicked-brain.md` |
| None matched | Fallback | ask the user |

If no signal matches, tell the user: "I couldn't detect your CLI automatically.
Which agent config file should I write to?" Accept a user-specified path and
write to that file directly.

### Step 3: Write config section

Read the target config file. If a `## wicked-brain` section already exists,
update it in place — replace from the `## wicked-brain` heading to the next
`##`-level heading (or end of file) with the new content. Do NOT append a
duplicate section. If no `## wicked-brain` section exists, append it at the
end of the file.

Write a section like this (adapt content to actual brain state):

```markdown
## wicked-brain

Digital brain: {brain_id} | {total} indexed items | {chunks} chunks, {wiki} wiki articles, {memory} memories

**Domain expertise:** {top 10 tags from step 1}

**Knowledge gaps:** {recent search_miss topics, if any}

**Linked brains:** {list from brain.json, or "none"}

### How to use

- **Search/explore**: use `wicked-brain:search` — replaces Grep, Glob, and Agent(Explore) for any open-ended search
- **Answer questions**: use `wicked-brain:query` — replaces Agent(Explore) for conceptual questions
- **Surface context**: call `wicked-brain:agent` (context) at the start of any new topic
- **Capture learnings**: call `wicked-brain:agent` (session-teardown) at session end
- **Store a decision/pattern/gotcha**: call `wicked-brain:memory` (store mode)
- **Available agents**: consolidate, context, session-teardown, onboard (via `wicked-brain:agent`)

### Rules (follow strictly)

- **ALWAYS check the brain BEFORE using Grep, Glob, Read, or Agent(Explore)** — for any find, search, explore, explain, or "what is/how does" request
- Use `wicked-brain:search` for finding content ("find X", "where is Y", "look for Z", "show me W")
- Use `wicked-brain:query` for questions ("what does X do", "how does Y work", "explain Z")
- Use `wicked-brain:agent` (context) when starting a new topic or unfamiliar area
- Only fall back to Grep/Glob for **exact pattern matching** after the brain returns no results
- Do NOT read brain files directly — always go through skills and agents
- Always pass `session_id` with search/query calls for access tracking
- Capture non-obvious decisions, patterns, and gotchas with `wicked-brain:memory`
```

### Step 4: Emit bus event

```bash
npx wicked-bus emit \
  --type "wicked.config.updated" \
  --domain "wicked-brain" \
  --subdomain "brain.system" \
  --payload '{"config_file":"{path}","platform":"{detected_platform}","brain_id":"{brain_id}"}' 2>/dev/null || true
```

Fire-and-forget — if the bus is not installed, silently skip.

### Step 5: Confirm

Report what was written and where:
- Config file: {path}
- Brain stats: {total} items, {expertise summary}
- Gaps noted: {N} search misses

## Cross-Platform Notes

- Uses Bash to check for env vars and directories
- Uses Read/Edit tools for config file management
- All paths use forward slashes
- On Windows, check `%USERPROFILE%` equivalents for home directory paths
