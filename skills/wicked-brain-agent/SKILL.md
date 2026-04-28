---
name: wicked-brain:agent
description: |
  This skill should be used when the user says "list brain agents",
  "dispatch the consolidation agent", "run brain context assembly",
  "onboard a new project", or "session teardown". Factory skill for listing
  and dispatching wicked-brain agents. Agents enforce multi-step pipelines
  for consolidation, context assembly, session teardown, and project
  onboarding.
---

# wicked-brain:agent

Factory skill for wicked-brain agents. Lists available agents and dispatches them.

## Config

Resolve the brain config via the shared resolution in
wicked-brain:init § "Resolving the brain config". In short: try
`~/.wicked-brain/projects/{cwd_basename}/_meta/config.json` first, fall back
to `~/.wicked-brain/_meta/config.json` (legacy flat), else trigger
wicked-brain:init. Read the resolved file for brain path and server port.

Do NOT read a bare relative `_meta/config.json` — the model will resolve it
against the current working directory and brain files will end up in the
project root.

## Parameters

- **action** (required): `list` or `dispatch`
- **agent** (dispatch mode): name of agent to dispatch (`consolidate`, `context`, `session-teardown`, `onboard`)
- **depth** (list mode, optional): 0 (summary), 1 (pipeline steps), 2 (full instructions). Default: 0.
- **params** (dispatch mode, optional): parameters to pass to the agent

## List Mode

Read agent definitions from the `agents/` subdirectory relative to this skill file. Return at requested depth.

**Depth 0** — one-line summaries:
- `consolidate`: Three-pass lifecycle — archive noise, promote patterns, merge duplicates
- `context`: Tiered knowledge surfacing — hot path for simple prompts, fast path for complex
- `session-teardown`: Capture session learnings — decisions, patterns, gotchas into memory
- `onboard`: Full project understanding — scan, trace, ingest, compile, configure

**Depth 1** — pipeline steps (read the agent's `## Depth 1` section)

**Depth 2** — full subagent instructions (read the agent's `## Depth 2` section)

## Dispatch Mode

Dispatching a named agent (rather than running inline) gives it isolated
context, a longer token budget, and access to file-writing tools. This makes
it better suited for heavy background tasks — consolidation, full project
onboarding, or large-scale compilation — where inline execution would exhaust
context or produce incomplete results.

1. Read the requested agent's `.md` file from `agents/` at depth 2
2. Dispatch as a subagent with those instructions using the host CLI's mechanism:
   - Claude Code: use `Agent` tool
   - Gemini CLI: `@agent_name` dispatch
   - Copilot CLI: `/agent` command
   - Other CLIs: inline execution (run the pipeline steps in current context)
3. Pass brain_path, port, and any additional params to the subagent

If the host CLI does not support subagent dispatch, fall back to inline execution — run the pipeline steps directly in the current context.

## Bus Events

When dispatching an agent, emit:

```bash
npx wicked-bus emit \
  --type "wicked.agent.dispatched" \
  --domain "wicked-brain" \
  --subdomain "brain.agent" \
  --payload '{"agent":"{agent_name}","brain_id":"{brain_id}"}' 2>/dev/null || true
```

The consolidate agent should also emit `wicked.brain.consolidated` on completion:

```bash
npx wicked-bus emit \
  --type "wicked.brain.consolidated" \
  --domain "wicked-brain" \
  --subdomain "brain" \
  --payload '{"brain_id":"{brain_id}","archived":{N},"promoted":{M},"merged":{P}}' 2>/dev/null || true
```

Fire-and-forget — if the bus is not installed, silently skip.

## Cross-Platform Notes

- Agent definitions are portable markdown — they work on all platforms
- Dispatch mechanism varies by CLI but instructions are identical
- Factory skill uses Read tool to load agent files (not shell commands)
