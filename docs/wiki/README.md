---
status: published
canonical_for: [CONTRIB-WIKI-INDEX]
references: []
owner: core
last_reviewed: 2026-04-17
---

# wicked-brain contributor wiki

Flat index. One line per page. Agents: start here.

| Page | Owns | Purpose |
|---|---|---|
| [invariants.md](invariants.md) | `INV-*` | Rules of the system. Every claim has an ID and an enforcer. |
| [contract-api.md](contract-api.md) | `CONTRACT-API` | Every `POST /api` action, params, implementation. **Generated.** |
| [contract-schema.md](contract-schema.md) | `CONTRACT-SCHEMA` | SQLite tables, columns, and the migration ladder. **Generated.** |
| [map-files.md](map-files.md) | `MAP-FILES` | Every `.mjs` in `server/lib` + `server/bin` — purpose, exports, local imports. **Generated.** |
| [extend-action.md](extend-action.md) | `RECIPE-ADD-ACTION` | Add a new `POST /api` action, end-to-end. |
| [extend-migration.md](extend-migration.md) | `RECIPE-ADD-MIGRATION` | Add a schema migration without breaking existing brains. |
| [operate-testing.md](operate-testing.md) | `RECIPE-RUN-TESTS` | Run the test suite the way CI does. |
| [operate-release.md](operate-release.md) | `RECIPE-RELEASE` | Cut a release via tag push. |
| `_generated/actions.json` | — | Machine-readable manifest backing `contract-api.md`. |
| `_generated/schema.json` | — | Machine-readable manifest backing `contract-schema.md`. |
| `_generated/files.json` | — | Machine-readable manifest backing `map-files.md`. |

## Conventions for this wiki

- **One canonical page per ID.** A duplicate `canonical_for` claim is a lint error — see `INV-CANONICAL-SINGLE-OWNER`.
- **Link, don't restate.** Pages reference canonical IDs or code files rather than quoting them. See `INV-LINK-DONT-RESTATE`.
- **Generated pages have `generated: true`.** Do not hand-edit — regenerate with `npm run gen:wiki`.
- **Every page has `## Purpose`, `## Contract` (if applicable), `## Invariants`, `## Gotchas`, `## See also`** as stable H2 anchors where they apply. Agents rely on this shape.

## Regenerating generated pages

```bash
cd server
npm run gen:wiki          # regenerate contract-api.md + _generated/actions.json
npm run gen:wiki:check    # exit 1 if the generated output would change (CI)
```

## Specs this wiki implements

- [`docs/specs/2026-04-17-wiki-discovery-contract.md`](../specs/2026-04-17-wiki-discovery-contract.md)
- [`docs/specs/2026-04-17-frontmatter-canonicality.md`](../specs/2026-04-17-frontmatter-canonicality.md)
