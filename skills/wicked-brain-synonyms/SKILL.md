---
name: wicked-brain:synonyms
description: |
  Manage the brain's synonym map for search expansion. Add, remove, or review
  synonym mappings. Can also auto-suggest synonyms from search miss data and
  tag frequency analysis.

  Use when: "add synonym", "manage synonyms", "brain synonyms",
  "why can't I find X", "search isn't finding".
---

# wicked-brain:synonyms

You manage the brain's synonym map for improved search recall.

## Cross-Platform Notes

Commands in this skill work on macOS, Linux, and Windows. When a command has
platform differences, alternatives are shown. Your native tools (Read, Write,
Grep, Glob) work everywhere — prefer them over shell commands when possible.

For the brain path default:
- macOS/Linux: ~/.wicked-brain
- Windows: %USERPROFILE%\.wicked-brain

## Config

Brain discovery + server lifecycle are handled by `wicked-brain-call`. Pass
`--brain <path>` to override the auto-detected brain, or set
`WICKED_BRAIN_PATH`. The CLI starts the server on first call (no manual
init required) and writes an audit record to `{brain}/calls/` per call.

## Synonym File

Location: `{brain_path}/_meta/synonyms.json`

Format:
```json
{
  "jwt": ["json web token", "auth token"],
  "auth": ["authentication", "authorization"]
}
```

Keys are the short/common form. Values are expansions to try when the key
appears in a search query. The search skill reads this file before executing
queries and automatically expands sparse results using these mappings.

## Commands

### Add a synonym

Parameters: `term`, `expansions` (comma-separated list)

1. Read `{brain_path}/_meta/synonyms.json` using the Read tool (or start with `{}` if the file does not exist).
2. Parse the JSON.
3. If the key already exists, merge the new expansions with the existing list (deduplicate).
4. If the key is new, add it with the provided expansions as an array.
5. Write the updated JSON back using the Write tool.
6. Confirm: `Synonym added: "{term}" → [{expansions}]`

### Remove a synonym

Parameters: `term`

1. Read `{brain_path}/_meta/synonyms.json` using the Read tool.
2. Parse the JSON.
3. Delete the key matching `term`. If the key does not exist, report that and stop.
4. Write the updated JSON back using the Write tool.
5. Confirm: `Synonym removed: "{term}"`

### Review synonyms

No parameters.

Read `{brain_path}/_meta/synonyms.json` using the Read tool and display the
current synonym map in a readable table:

```
Synonym map ({N} entries):

  jwt           → json web token, auth token
  auth          → authentication, authorization
  k8s           → kubernetes
```

If the file does not exist, report: "No synonyms defined yet. Use 'add synonym' to create mappings."

### Auto-suggest

Analyze search misses and tag frequency to surface candidate synonym mappings
for user review.

**Step 1: Get recent search misses**

```bash
npx wicked-brain-call search_misses --param limit=50
```

**Step 2: Get tag frequency**

```bash
npx wicked-brain-call tag_frequency
```

**Step 3: Cross-reference and suggest**

For each search miss query:
- Check whether any word in the query is a substring of an existing tag or vice versa.
  Example: miss query "k8s deploy" — tag "kubernetes" contains "k8s" as a known abbreviation.
- If a match is found, propose: `"{miss_word}" → ["{tag}"]`

For tags that appear to be alternate forms of each other (e.g., "auth" and
"authentication" both present as tags), suggest consolidating them:
- `"auth" → ["authentication"]`

**Step 4: Present suggestions for approval**

List all suggestions in a numbered table before writing anything:

```
Suggested synonyms (review before applying):

  1. "k8s"    → ["kubernetes"]         (from search miss: "k8s deploy")
  2. "auth"   → ["authentication"]     (tag consolidation)
```

Ask: "Apply all, apply some (specify numbers), or cancel?"

Only write to `synonyms.json` after explicit user approval. Merge approved
suggestions with any existing entries using the same add-synonym logic above.

## Bus Events

After any write to `synonyms.json` (add, remove, or auto-suggest apply), emit:

```bash
npx wicked-bus emit \
  --type "wicked.synonym.updated" \
  --domain "wicked-brain" \
  --subdomain "brain.taxonomy" \
  --payload '{"operation":"{add|remove|auto-apply}","term":"{term}","brain_id":"{brain_id}"}' 2>/dev/null || true
```

Fire-and-forget — if the bus is not installed, silently skip.
