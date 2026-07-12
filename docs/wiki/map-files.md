---
status: published
canonical_for: [MAP-FILES]
references: []
owner: core
last_reviewed: 2026-07-12
generated: true
source_roots: [server/lib, server/bin]
---

# Map: files

Generated walk of `server/lib`, `server/bin`. Do not hand-edit — regenerate with `npm run gen:wiki`. Purpose strings come from the first JSDoc block in each file; files without a JSDoc header have empty purpose and are candidates for docstring work.

## Files

| Path | Purpose | Exports | Local imports |
|---|---|---|---|
| `server/bin/onboard-wiki.mjs` | wicked-brain-onboard-wiki | — | `../lib/onboard-wiki.mjs` |
| `server/bin/wicked-brain-call.mjs` | — | — | `../lib/project-id.mjs` |
| `server/bin/wicked-brain-server.mjs` | Listen on `startPort`, probing upward on EADDRINUSE. Probes using the real server instance so the bind semantics (dual-stack IPv4+IPv6) match the eventual listener — a separate 127.0.0.1 probe would miss an IPv6-only conflict and produce a false "free" result. | — | `../lib/brain-walker.mjs`, `../lib/bus.mjs`, `../lib/codegraph-actions.mjs`, `../lib/file-watcher.mjs`, `../lib/lsp-client.mjs`, `../lib/memory-subscriber.mjs`, `../lib/onboard-wiki.mjs`, `../lib/sqlite-search.mjs`, `../lib/viewer-page.mjs` |
| `server/lib/brain-walker.mjs` | Walk a brain path and surface every authored `.md` file under the content subdirectories (chunks/, wiki/, memory/). Deliberately excludes `_meta/`, `raw/`, `.brain.db`, and any dotfile/dotdir. Paths returned are relative to the brain path and use forward slashes per INV-PATHS-FORWARD. | `purgeBrainContent`, `walkBrainContent` | — |
| `server/lib/bus.mjs` | wicked-bus integration for wicked-brain-server. | `busAvailable`, `dropBusDeadLetter`, `emitEvent`, `getBusDb`, `isBusAvailable`, `listBusDeadLetters`, `replayBusDeadLetter`, `waitForBus` | — |
| `server/lib/canonical-registry.mjs` | Canonical registry: maps canonical IDs (e.g. "INV-PATHS-FORWARD") to the single page that owns them. Detects violations of the "one page per ID" rule and broken references. | `buildRegistry`, `findBrokenReferences`, `loadWikiEntries` | `./frontmatter.mjs` |
| `server/lib/codegraph-actions.mjs` | Build the graph-* action handlers bound to a source repo. A fresh client per call keeps the readonly DB handle short-lived and always reopens after a rebuild. | `makeGraphActions` | `./codegraph-client.mjs`, `./codegraph-extract.mjs`, `./codegraph-index.mjs` |
| `server/lib/codegraph-client.mjs` | Transitive dependents — "what breaks if I change X". | `CodegraphClient` | `./codegraph-index.mjs` |
| `server/lib/codegraph-extract.mjs` | codegraph-extract.mjs — extractor registry (builtins + drop-ins). | `discoverDropins`, `runExtractors` | `./codegraph-extractors/bus.mjs`, `./codegraph-extractors/capability.mjs`, `./codegraph-extractors/dispatch.mjs`, `./codegraph-nodes.mjs` |
| `server/lib/codegraph-index.mjs` | How far the graph has drifted from HEAD. Fail-open: errors report present-but-unknown, never throw. @returns {{present:boolean, stale:boolean\|null, commits_behind:number\|null, indexed_at:string\|null}} | `dbPath`, `runIndex`, `staleness` | `./codegraph-resolver.mjs` |
| `server/lib/codegraph-nodes.mjs` | codegraph-nodes.mjs — self-noding helpers for injected-edge extractors. | `ensureFileNode`, `ensureVirtualNode` | — |
| `server/lib/codegraph-resolver.mjs` | Resolve the argv prefix that invokes codegraph, or null. Ladder: WICKED_CODEGRAPH_BIN (set-but-empty = kill switch) -> brain _meta/codegraph.json {bin} -> PATH -> source node_modules/.bin -> `npx`. | `codegraphAvailable`, `resolveCodegraph` | — |
| `server/lib/detect-mode.mjs` | Pure classifier. Takes shallow scan inputs, returns mode verdict. | `classifyRepo`, `defaultWikiRoots`, `detectRepoMode` | — |
| `server/lib/file-watcher.mjs` | Recursive fs.watch over brain content with a polling fallback. | `FileWatcher` | — |
| `server/lib/frontmatter.mjs` | Minimal YAML-subset frontmatter parser. | `extractFrontmatter`, `getField`, `parseFrontmatter`, `parseFrontmatterBlock`, `serializeFrontmatterBlock` | — |
| `server/lib/gen-contract-api.mjs` | Contract API generator. | `extractActions`, `renderActionsJson`, `renderContractApi` | — |
| `server/lib/gen-contract-schema.mjs` | Contract schema generator. | `extractSchema`, `renderContractSchema`, `renderSchemaJson` | — |
| `server/lib/gen-file-map.mjs` | File-map generator. | `buildFileRecord`, `renderFileMap`, `renderFileMapJson` | — |
| `server/lib/lint-wiki.mjs` | Wiki linter. | `formatFindings`, `lintExitCode`, `ruleBrokenReference`, `ruleDuplicateCanonicalFor`, `ruleLongPageLowRefs`, `ruleMissingCanonicalPurpose`, `runLintRules` | — |
| `server/lib/lsp-client.mjs` | LSP Client — orchestrates language server actions, file sync, and caching. Uses LspManager for server lifecycle and RpcClient for protocol. | `LspClient` | `./lsp-helpers.mjs`, `./lsp-manager.mjs`, `./lsp-servers.mjs` |
| `server/lib/lsp-helpers.mjs` | LSP helpers — normalization, symbol kind mapping, and chunk building. Split from lsp-client.mjs to keep files under 300 lines. | `buildDiagnosticsChunk`, `buildSymbolChunk`, `normalizeLocations`, `normalizeSymbols`, `severityName`, `symbolKindName` | — |
| `server/lib/lsp-manager.mjs` | Manages language server processes — spawn, health check, crash recovery, shutdown. | `LspManager` | `./lsp-protocol.mjs` |
| `server/lib/lsp-protocol.mjs` | LSP JSON-RPC protocol over stdio. Handles Content-Length framing, request/response matching, and notifications. | `MessageReader`, `RpcClient`, `writeMessage` | — |
| `server/lib/lsp-servers.mjs` | Known language servers map — 40+ servers covering 70+ extensions. Extensible via {brainPath}/_meta/lsp.json. | `KNOWN_SERVERS`, `getKnownExtensions`, `loadUserConfig`, `resolveServer` | — |
| `server/lib/memory-promoter.mjs` | Promotion policy for auto-memorizing wicked.fact.extracted bus events. | `computeContentHash`, `promoteFact`, `slugify` | — |
| `server/lib/memory-subscriber.mjs` | Auto-memorize subscriber: bridges wicked-bus fact events into brain memories. | `fastForwardStaleCursor`, `renderMemoryFile`, `startMemorySubscriber` | `./bus.mjs`, `./memory-promoter.mjs` |
| `server/lib/mode-config.mjs` | Validate a mode.json body. Returns { ok, errors } — does not throw. Kept in lockstep with mode.schema.json. The schema is the canonical documentation; this is the runtime enforcement. | `MODE_FILE_PATH`, `diffMode`, `readModeFile`, `validateMode`, `writeModeFile` | — |
| `server/lib/onboard-wiki.mjs` | Onboard-wiki orchestrator. | `formatOnboardResult`, `runOnboardWiki` | `./detect-mode.mjs`, `./mode-config.mjs`, `./stamp-pointer.mjs` |
| `server/lib/project-id.mjs` | Canonical project-id slug + per-project brain resolution. | `baseName`, `projectId`, `resolvePerProjectBrain`, `slugifyId` | — |
| `server/lib/sqlite-search.mjs` | Parse a source_hashes entry of the form "{chunk_path}: {hash}". Returns null if the shape doesn't match — malformed entries are skipped rather than blocking the whole verify call. | `SqliteSearch`, `deriveSourceType` | `./frontmatter.mjs`, `./wikilinks.mjs` |
| `server/lib/stamp-pointer.mjs` | CLAUDE.md / AGENTS.md contributor-wiki pointer stamping. | `buildSection`, `stampWikiPointer` | — |
| `server/lib/viewer-page.mjs` | Read-only HTML viewer for a wicked-brain instance. | `renderViewerHtml` | — |
| `server/lib/wikilinks.mjs` | — | `parseWikilinks` | — |

