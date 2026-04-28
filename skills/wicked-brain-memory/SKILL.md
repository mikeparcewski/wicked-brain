---
name: wicked-brain:memory
description: |
  Store and recall experiential learnings (decisions, patterns, preferences,
  gotchas, discoveries) in the brain's memory system.

  Use when: "remember this", "store this decision", "recall what we decided",
  "what do I know about", "brain memory".
---

# wicked-brain:memory

Store and recall experiential learnings in the brain's memory system.

## Cross-Platform Notes

This skill uses `npx wicked-brain-call` for all server interaction. The CLI
works on macOS, Linux, and Windows; it discovers the brain, auto-starts the
server, and writes a per-call audit record under `{brain}/calls/`.

- File writes use agent-native tools (Write/Edit), not shell commands
- Path separator: always use forward slashes in `contains:` and `path` fields
- Brain path default: `~/.wicked-brain/projects/{project-name}` (macOS/Linux), `%USERPROFILE%\.wicked-brain\projects\{project-name}` (Windows)

## Config

Brain discovery + server lifecycle are handled by `wicked-brain-call`. Pass
`--brain <path>` to override the auto-detected brain, or set
`WICKED_BRAIN_PATH`. The CLI starts the server on first call (no manual
init required) and writes an audit record to `{brain}/calls/` per call.

## Parameters

- **mode** (required): `store` or `recall`
- **content** (store mode): the memory content to store
- **type** (store mode, optional): `decision`, `pattern` (alias: `procedural`), `preference`, `gotcha`, or `discovery`. Auto-detected if omitted. `procedural` is an input alias only — storage frontmatter always writes `type: pattern`.
- **ttl_days** (store mode, optional): number of days before this memory expires. Defaults by type.
- **importance** (store mode, optional): `low`, `medium`, or `high`. Overrides the type default. Bands: low = 1-3, medium = 4-6, high = 7-10. Used to derive the initial tier (see Step 2b).
- **tier** (store mode, optional): explicit tier override (`working`, `episodic`, `semantic`). Takes precedence over `importance`.
- **query** (recall mode): search term for finding memories
- **filter_type** (recall mode, optional): filter by memory type. `procedural` is normalized to `pattern`.
- **filter_tier** (recall mode, optional): filter by tier (`working`, `episodic`, `semantic`)

## Store Mode

### Step 1: Detect type

If type is not provided, classify the content:
- Contains "decided", "chose", "will use", "going with" → `decision`
- Contains "pattern", "always", "tends to", "convention" → `pattern` (if the caller explicitly passed `type: procedural`, normalize to `pattern` before continuing)
- Contains "prefer", "like", "want", "should always" → `preference`
- Contains "watch out", "careful", "gotcha", "trap", "bug" → `gotcha`
- Otherwise → `discovery`

#### Type aliases

- `procedural` → `pattern` (normalize on input; storage always writes `type: pattern`)

### Step 2: Apply type defaults

| Type | Default importance | Default ttl_days |
|------|-------------------|-----------------|
| decision | 7 | null (permanent) |
| pattern | 6 | null (permanent) |
| preference | 6 | null (permanent) |
| gotcha | 5 | 30 |
| discovery | 4 | 14 |

Agent-provided overrides take precedence. An explicit `importance` arg overrides the type default.

### Step 2b: Resolve initial tier from importance

- If `tier` is explicitly passed → use that, skip the rest.
- Else if `importance` is `high` (or numeric importance >= 7) → `semantic`
- Else if `importance` is `low` (or numeric importance <= 3) → `working`
- Else (medium, or 4-6) → `episodic`

### Step 3: Generate tags with synonym expansion

Extract 5-10 keyword tags from the content. For each tag, add 1-3 synonyms:
- Abbreviations: JWT → "json-web-token", K8s → "kubernetes"
- Synonyms: "auth" → "authentication", "DB" → "database"
- Related concepts: "JWT" → "tokens", "session", "security"
- Domain hierarchy: specific terms get their general category added

Cap total tags at 15. Deduplicate.

### Step 4: Generate safe filename

Slugify a summary of the content:
- Lowercase, replace spaces with hyphens, remove special chars
- Max 60 characters
- Example: "Decided to use JWT with 15-min expiry" → `jwt-15min-expiry-decision.md`

### Step 5: Write memory file

Write to `{brain_path}/memory/{safe_name}.md`:

```yaml
---
type: {detected or provided type}
tier: {resolved tier from Step 2b}
confidence: 0.5
importance: {from type defaults or override}
ttl_days: {from type defaults or override, null if permanent}
session_origin: "{current session identifier or ISO timestamp}"
contains:
  - {tag1}
  - {tag2}
  - {synonym-expanded tags...}
entities:
  people: [{if mentioned}]
  systems: [{if mentioned}]
indexed_at: "{ISO 8601 timestamp}"
---

{memory content}
```

#### Tier definitions

- **working**: Active, session-specific context. Expires quickly (hours to days). Use for in-progress decisions, temporary notes, and things only relevant to the current task.
- **episodic**: Specific events or decisions from past sessions. Medium longevity. Use for "we decided X on date Y" or "this happened in project Z".
- **semantic**: Generalized patterns and facts extracted from experience. Permanent by default. Use for stable conventions, recurring patterns, and distilled knowledge that transcends any single session.

New memories start at the tier resolved from importance (default `episodic` for medium importance, `working` for low, `semantic` for high). Consolidation (wicked-brain:consolidate) still promotes them across tiers based on access frequency and age.

#### Complete example

```yaml
---
type: decision
tier: semantic
confidence: 0.9
importance: 7
ttl_days: null
session_origin: "2026-04-07T14:23:00Z"
contains:
  - jwt
  - json-web-token
  - authentication
  - auth
  - tokens
  - session
  - security
  - expiry
  - 15-minutes
  - access-control
entities:
  people: []
  systems: ["auth-service", "api-gateway"]
indexed_at: "2026-04-07T14:23:01Z"
---

Decided to use JWT with a 15-minute expiry for the auth-service API. Refresh tokens stored in HttpOnly cookies with 7-day TTL. Rationale: short access token lifetime limits blast radius if a token is leaked.
```

The server's file watcher will auto-index this file.

### Step 6: Log the store event

Append to `{brain_path}/_meta/log.jsonl`:

```json
{"ts":"{ISO}","op":"memory_store","path":"memory/{safe_name}.md","type":"{type}","tier":"{resolved tier}","author":"agent:memory"}
```

### Step 7: Emit bus event

```bash
npx wicked-bus emit \
  --type "wicked.memory.stored" \
  --domain "wicked-brain" \
  --subdomain "brain.memory" \
  --payload '{"path":"memory/{safe_name}.md","type":"{type}","tier":"{resolved tier}","brain_id":"{brain_id}"}' 2>/dev/null || true
```

Fire-and-forget — if the bus is not installed, silently skip.

## Recall Mode

### Progressive loading

- **Depth 0**: frontmatter only — type, tier, confidence, importance, contains tags
- **Depth 1**: + first 3 lines of content (summary)
- **Depth 2**: full content

### Step 1: Search

```bash
npx wicked-brain-call search --param query={query} --param limit=10 --param session_id={session_id}
```

Pass a session_id with every search call. This enables access tracking for
consolidation. Use a consistent session_id for the entire conversation.

### Step 2: Filter results

Filter to paths starting with `memory/`. If filter_type or filter_tier provided, read frontmatter and filter accordingly. Normalize `filter_type: procedural` to `pattern` before matching, so it matches memories stored with `type: pattern`.

### Step 3: Apply tier weighting

Re-rank results by applying tier multipliers:
- `semantic`: score x 1.3
- `episodic`: score x 1.0
- `working`: score x 0.8

### Step 4: Return at requested depth

Return results at the requested depth level. Default to depth 0.
