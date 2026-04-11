---
name: wicked-brain:configure
description: Read brain state and write contextual instructions into the active CLI's agent config file. Run after onboarding, major ingests, or consolidation.
---

# wicked-brain:configure

Writes a contextual `## wicked-brain` section into the active CLI/IDE's agent config file.

## Config

Read `_meta/config.json` for brain path and server port.
If it doesn't exist, trigger wicked-brain:init.

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

- **Before responding**: call `wicked-brain:agent` (context) to surface relevant knowledge
- **Capture learnings**: call `wicked-brain:agent` (session-teardown) at session end
- **Store a decision/pattern/gotcha**: call `wicked-brain:memory` (store mode)
- **Ask the brain**: call `wicked-brain:query` for cited answers
- **Available agents**: consolidate, context, session-teardown, onboard (via `wicked-brain:agent`)

### Rules

- Do NOT read brain files directly — use skills and agents
- Always pass session_id with search calls for access tracking
- Capture non-obvious decisions and gotchas as memories
```

### Step 4: Confirm

Report what was written and where:
- Config file: {path}
- Brain stats: {total} items, {expertise summary}
- Gaps noted: {N} search misses

## Cross-Platform Notes

- Uses Bash to check for env vars and directories
- Uses Read/Edit tools for config file management
- All paths use forward slashes
- On Windows, check `%USERPROFILE%` equivalents for home directory paths
