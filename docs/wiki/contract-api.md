---
status: published
canonical_for: [CONTRACT-API]
references: []
owner: core
last_reviewed: 2026-04-18
generated: true
source: server/bin/wicked-brain-server.mjs
---

# Contract: `POST /api`

Single endpoint, action-dispatched. Body shape:

```json
{ "action": "<name>", "params": { ... } }
```

This page is **generated** from the server source. Do not hand-edit — changes will be overwritten on the next `npm run gen:wiki`. The truth lives at `server/bin/wicked-brain-server.mjs`; update that, then regenerate.

## Actions

| Action | Params referenced | Implementation |
|---|---|---|
| `health` | — | `server/lib/sqlite-search.mjs#health` |
| `search` | `query` | `server/lib/sqlite-search.mjs#search` |
| `federated_search` | `query` | `server/lib/sqlite-search.mjs#federatedSearch` |
| `index` | `id`, `path` | `server/lib/sqlite-search.mjs#index` |
| `remove` | `id` | `server/lib/sqlite-search.mjs#remove` |
| `reindex` | `docs` | `server/lib/sqlite-search.mjs#reindex` |
| `backlinks` | `id` | `server/lib/sqlite-search.mjs#backlinks` |
| `forward_links` | `id` | `server/lib/sqlite-search.mjs#forwardLinks` |
| `get_document` | `id`, `path` | `server/lib/sqlite-search.mjs#getDocument`, `server/lib/sqlite-search.mjs#getDocumentByPath` |
| `list_docs` | — | `server/lib/sqlite-search.mjs#listDocuments` |
| `stats` | — | `server/lib/sqlite-search.mjs#stats` |
| `memory_stats` | — | `server/lib/sqlite-search.mjs#memoryStats` |
| `candidates` | — | `server/lib/sqlite-search.mjs#candidates` |
| `symbols` | `name`, `query` | `server/lib/sqlite-search.mjs#symbols`, `server/lib/lsp-client.mjs#workspaceSymbols` |
| `dependents` | — | `server/lib/sqlite-search.mjs#dependents` |
| `refs` | — | `server/lib/lsp-client.mjs#references` |
| `access_log` | `id` | `server/lib/sqlite-search.mjs#accessLog` |
| `recent_memories` | — | `server/lib/sqlite-search.mjs#recentMemories` |
| `contradictions` | — | `server/lib/sqlite-search.mjs#contradictions` |
| `confirm_link` | `source_id`, `target_path`, `verdict` | `server/lib/sqlite-search.mjs#confirmLink` |
| `link_health` | — | `server/lib/sqlite-search.mjs#linkHealth` |
| `tag_frequency` | — | `server/lib/sqlite-search.mjs#tagFrequency` |
| `search_misses` | — | `server/lib/sqlite-search.mjs#searchMisses` |
| `wiki_list` | — | `server/lib/sqlite-search.mjs#wikiList` |
| `verify_wiki` | — | `server/lib/sqlite-search.mjs#verifyWiki` |
| `lsp-health` | — | `server/lib/lsp-client.mjs#health` |
| `lsp-symbols` | — | `server/lib/lsp-client.mjs#symbols` |
| `lsp-definition` | — | `server/lib/lsp-client.mjs#definition` |
| `lsp-references` | — | `server/lib/lsp-client.mjs#references` |
| `lsp-hover` | — | `server/lib/lsp-client.mjs#hover` |
| `lsp-implementation` | — | `server/lib/lsp-client.mjs#implementation` |
| `lsp-workspace-symbols` | — | `server/lib/lsp-client.mjs#workspaceSymbols` |
| `lsp-call-hierarchy-in` | — | `server/lib/lsp-client.mjs#callHierarchyIn` |
| `lsp-call-hierarchy-out` | — | `server/lib/lsp-client.mjs#callHierarchyOut` |
| `lsp-diagnostics` | — | `server/lib/lsp-client.mjs#diagnostics` |
| `reonboard` | — | `server/lib/sqlite-search.mjs#reindex` |
| `purge_brain` | `confirm` | `server/lib/sqlite-search.mjs#reindex` |

## Per-action anchors

### `health`

- Implementation: `server/lib/sqlite-search.mjs#health`

### `search`

- Implementation: `server/lib/sqlite-search.mjs#search`
- Params referenced: `query`

### `federated_search`

- Implementation: `server/lib/sqlite-search.mjs#federatedSearch`
- Params referenced: `query`

### `index`

- Implementation: `server/lib/sqlite-search.mjs#index`
- Params referenced: `id`, `path`

### `remove`

- Implementation: `server/lib/sqlite-search.mjs#remove`
- Params referenced: `id`

### `reindex`

- Implementation: `server/lib/sqlite-search.mjs#reindex`
- Params referenced: `docs`

### `backlinks`

- Implementation: `server/lib/sqlite-search.mjs#backlinks`
- Params referenced: `id`

### `forward_links`

- Implementation: `server/lib/sqlite-search.mjs#forwardLinks`
- Params referenced: `id`

### `get_document`

- Implementation: `server/lib/sqlite-search.mjs#getDocument`
- Implementation: `server/lib/sqlite-search.mjs#getDocumentByPath`
- Params referenced: `id`, `path`

### `list_docs`

- Implementation: `server/lib/sqlite-search.mjs#listDocuments`

### `stats`

- Implementation: `server/lib/sqlite-search.mjs#stats`

### `memory_stats`

- Implementation: `server/lib/sqlite-search.mjs#memoryStats`

### `candidates`

- Implementation: `server/lib/sqlite-search.mjs#candidates`

### `symbols`

- Implementation: `server/lib/sqlite-search.mjs#symbols`
- Implementation: `server/lib/lsp-client.mjs#workspaceSymbols`
- Params referenced: `name`, `query`
- Async handler.

### `dependents`

- Implementation: `server/lib/sqlite-search.mjs#dependents`

### `refs`

- Implementation: `server/lib/lsp-client.mjs#references`
- Async handler.

### `access_log`

- Implementation: `server/lib/sqlite-search.mjs#accessLog`
- Params referenced: `id`

### `recent_memories`

- Implementation: `server/lib/sqlite-search.mjs#recentMemories`

### `contradictions`

- Implementation: `server/lib/sqlite-search.mjs#contradictions`

### `confirm_link`

- Implementation: `server/lib/sqlite-search.mjs#confirmLink`
- Params referenced: `source_id`, `target_path`, `verdict`

### `link_health`

- Implementation: `server/lib/sqlite-search.mjs#linkHealth`

### `tag_frequency`

- Implementation: `server/lib/sqlite-search.mjs#tagFrequency`

### `search_misses`

- Implementation: `server/lib/sqlite-search.mjs#searchMisses`

### `wiki_list`

- Implementation: `server/lib/sqlite-search.mjs#wikiList`

### `verify_wiki`

- Implementation: `server/lib/sqlite-search.mjs#verifyWiki`

### `lsp-health`

- Implementation: `server/lib/lsp-client.mjs#health`

### `lsp-symbols`

- Implementation: `server/lib/lsp-client.mjs#symbols`

### `lsp-definition`

- Implementation: `server/lib/lsp-client.mjs#definition`

### `lsp-references`

- Implementation: `server/lib/lsp-client.mjs#references`

### `lsp-hover`

- Implementation: `server/lib/lsp-client.mjs#hover`

### `lsp-implementation`

- Implementation: `server/lib/lsp-client.mjs#implementation`

### `lsp-workspace-symbols`

- Implementation: `server/lib/lsp-client.mjs#workspaceSymbols`

### `lsp-call-hierarchy-in`

- Implementation: `server/lib/lsp-client.mjs#callHierarchyIn`

### `lsp-call-hierarchy-out`

- Implementation: `server/lib/lsp-client.mjs#callHierarchyOut`

### `lsp-diagnostics`

- Implementation: `server/lib/lsp-client.mjs#diagnostics`

### `reonboard`

- Implementation: `server/lib/sqlite-search.mjs#reindex`
- Async handler.

### `purge_brain`

- Implementation: `server/lib/sqlite-search.mjs#reindex`
- Params referenced: `confirm`
- Async handler.

