# Wiki Discovery Contract

**Status:** Draft
**Date:** 2026-04-17
**Owner:** wicked-brain core

## Purpose

Define how an agent — human or AI — locates the contributor wiki in any repo
that wicked-brain has onboarded. The contract must be deterministic: given a
repo root, there is exactly one correct answer to "where is the wiki" and it
is findable by reading a single file.

## Non-goals

- Not a spec for what pages the wiki contains. See the code-mode and
  content-mode page sets (Phase 4).
- Not a spec for frontmatter / canonical tagging. See Phase 3.
- Not a spec for ingest-time dedup or search-time collapse. See Phase 3.

## Terms

- **Repo root** — the directory containing the project manifest
  (`package.json`, `pyproject.toml`, etc.) or the top-level `.git` directory.
- **Wiki root** — the directory holding contributor wiki pages. Path is
  repo-relative.
- **Content root** — the directory holding the primary content corpus in
  content-mode or mixed-mode repos. Null in code-mode.
- **Mode file** — `.wicked-brain/mode.json` at the repo root. Canonical
  source of truth for wiki location and repo classification.

## The mode file

Canonical path: `<repo_root>/.wicked-brain/mode.json`.

Schema: `server/lib/mode.schema.json` (JSON Schema 2020-12).
Runtime validation: `validateMode()` in `server/lib/mode-config.mjs`.

Required fields: `schema_version`, `mode`, `wiki_root`, `detected_at`,
`override`. Optional: `content_root`, `score`, `reasons`.

Example — detected code repo:

```json
{
  "schema_version": 1,
  "mode": "code",
  "wiki_root": "wiki",
  "content_root": null,
  "detected_at": "2026-04-17",
  "override": false,
  "score": { "code": 45, "content": 3 },
  "reasons": ["+10 package.json", "+5 server/", "+20 code_ratio=0.81"]
}
```

Example — human-overridden content repo with docs corpus:

```json
{
  "schema_version": 1,
  "mode": "content",
  "wiki_root": "wiki",
  "content_root": "docs",
  "detected_at": "2026-04-10",
  "override": true
}
```

## Agent lookup order

When an agent needs to locate the wiki, it follows this sequence and stops at
the first hit:

1. **Mode file** — `<repo_root>/.wicked-brain/mode.json`. Read `wiki_root`.
2. **Pointer in CLAUDE.md or AGENTS.md** — line matching
   `^\s*Contributor wiki:\s*(\S+)\s*$`. Treat capture group as a
   repo-relative path.
3. **Convention** — `wiki/` if it exists.
4. **Convention fallback** — `docs/wiki/` if it exists.
5. **Last resort** — `docs/` if it exists.

If steps 1–5 all miss, there is no wiki. Agents should surface that to the
user rather than guessing.

Content-root lookup (only in content/mixed modes):

1. **Mode file** — `content_root`.
2. **Convention** — `content/`, then `docs/`, then `posts/`.

## Override semantics

`override: true` in the mode file means a human set it. Detection must never
overwrite an override-flagged file without an explicit override-write from
the caller.

Callers mutating an override-flagged file are responsible for preserving the
flag: writing with `override: false` silently downgrades and is not allowed.

Re-onboarding a repo with an override-flagged mode file must warn the user
if detection disagrees with the override — without writing.

## CLAUDE.md / AGENTS.md pointer pattern

Projects that use CLAUDE.md or AGENTS.md as the agent entry point should
include a one-line pointer. The pointer is redundant with the mode file but
helps agents that index markdown before checking dot-directories.

Recommended pattern:

```markdown
## Contributor wiki

Contributor wiki: ./wiki

Invariants, extension recipes, and operational guides live there.
Read `wiki/README.md` before making changes.
```

The line starting `Contributor wiki:` is the machine-readable anchor. Prose
around it is for humans.

If the project has both CLAUDE.md and AGENTS.md, both must carry the pointer
and both must agree. A PostToolUse hook should enforce sync.

## Collision policy

| Existing state | Action |
|----------------|--------|
| `wiki/` free | Use `wiki/`. |
| `docs/` user-facing (README funnels into it, has getting-started) | Use `wiki/` in parallel. Do not merge. |
| `docs/` contributor-facing (architecture notes, CONTRIBUTING) | Use `docs/wiki/` inside the existing tree. |
| Both `wiki/` and `docs/` taken for other purposes | Use `.agent-wiki/` as last resort. Set `wiki_root` explicitly. |

Detection is heuristic. When ambiguous, prompt the user once, write the
choice to the mode file with `override: true`, and never re-ask.

## Re-onboarding behavior

On re-onboard:

1. Run detection.
2. Read existing mode file if present.
3. If existing file has `override: true` and detection disagrees: warn, do
   nothing.
4. If existing file has `override: false` and detection agrees: refresh
   `detected_at` and `reasons`.
5. If existing file has `override: false` and detection disagrees: write new
   result, log the flip, surface to user on next `wicked-brain:status`.

## Compatibility

`schema_version` starts at 1. Incompatible field changes bump the version.
Readers must refuse to consume a higher-versioned file and surface a
"wicked-brain update required" message.

## Open questions

- Should the pointer pattern also support `Content corpus:` as a second
  anchor, or is `content_root` in the mode file sufficient? Leaning
  mode-file-only to avoid duplication.
- Monorepo mode files: one per workspace package, or one at repo root with a
  per-package override map? Deferred until there's a real monorepo testbed.
