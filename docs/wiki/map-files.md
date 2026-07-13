---
status: published
canonical_for: [MAP-FILES]
references: []
owner: core
last_reviewed: 2026-07-13
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
| `server/bin/wicked-brain-server.mjs` | Listen on `startPort`, probing upward on EADDRINUSE. Probes using the real server instance so the bind semantics (dual-stack IPv4+IPv6) match the eventual listener — a separate 127.0.0.1 probe would miss an IPv6-only conflict and produce a false "free" result. | — | `../lib/brain-walker.mjs`, `../lib/bus.mjs`, `../lib/file-watcher.mjs`, `../lib/lsp-client.mjs`, `../lib/memory-subscriber.mjs`, `../lib/onboard-wiki.mjs`, `../lib/sqlite-search.mjs`, `../lib/viewer-page.mjs` |
| `server/lib/brain-walker.mjs` | Walk a brain path and surface every authored `.md` file under the content subdirectories (chunks/, wiki/, memory/). Deliberately excludes `_meta/`, `raw/`, `.brain.db`, and any dotfile/dotdir. Paths returned are relative to the brain path and use forward slashes per INV-PATHS-FORWARD. | `purgeBrainContent`, `walkBrainContent` | — |
| `server/lib/bus.mjs` | wicked-bus integration for wicked-brain-server. | `busAvailable`, `dropBusDeadLetter`, `emitEvent`, `getBusDb`, `isBusAvailable`, `listBusDeadLetters`, `replayBusDeadLetter`, `waitForBus` | — |
| `server/lib/canonical-registry.mjs` | Canonical registry: maps canonical IDs (e.g. "INV-PATHS-FORWARD") to the single page that owns them. Detects violations of the "one page per ID" rule and broken references. | `buildRegistry`, `findBrokenReferences`, `loadWikiEntries` | `./frontmatter.mjs` |
| `server/lib/conformance-fixture.mjs` | @returns {object} a valid conformance-rules.schema.json document. | `conformanceFixture` | — |
| `server/lib/conformance-ingest.mjs` | Default ingest-fidelity confidence for a doc-sourced rule that does not declare its own. Conservative on purpose: a doc-only source rests on source_kinds:['doc'] (trust-eligible, not proven per the spine's TRUST RULE), so an un-annotated ingested rule sits at the midpoint until a human ratifies it upward. A doc MAY override via a `confidence:` field. | `DEFAULT_INGEST_CONFIDENCE`, `DEFAULT_SEVERITY`, `confluenceAdapter`, `filesystemAdapter`, `normalizeDoc`, `parseMarkdownDoc`, `sharepointAdapter`, `toDocument` | — |
| `server/lib/conformance-store.mjs` | Severity ordering — exported so a downstream enforcer can map severity to a gate policy. The store does NOT gate on it (severity is advisory metadata). | `SEVERITY_ORDER`, `deleteRuleSet`, `enforceConformanceInvariants`, `persistConformanceRules`, `recallRules` | `../../schemas/index.mjs`, `./schema-validate.mjs` |
| `server/lib/coverage.mjs` | @param {import("./estate-client.mjs").EstateClient} estate @param {object} [partialConfig] overrides for config.coverage.* @returns {{ report: object, ok: boolean, unaccounted: string[] }} | `classifyNode`, `computeCoverage` | `./domain-config.mjs` |
| `server/lib/detect-mode.mjs` | Pure classifier. Takes shallow scan inputs, returns mode verdict. | `classifyRepo`, `defaultWikiRoots`, `detectRepoMode` | — |
| `server/lib/domain-config.mjs` | Shallow-merge a partial config over the defaults (coverage.* only for v1). | `DEFAULT_CONFIG`, `withConfig` | — |
| `server/lib/domain-model.mjs` | @param {import("./estate-client.mjs").EstateClient} estate @param {object} [opts] @param {object} [opts.config] kind-set overrides (config.coverage.*) @param {string} [opts.source] repo/service the model was mined from @param {"functional"\|"structural"} [opts.migrationMode] default "functional" @param {number} [opts.minClusterSize] passed to read_clusters (default 2) @returns {{ document: object }} | `buildDomainModel` | `./domain-config.mjs`, `./estate-client.mjs` |
| `server/lib/domain-store.mjs` | Validate + persist a domain-model document. Idempotent per model_id: an existing model with the same id is replaced. @returns {{ model_id: string, domains: number, requirements: number, rules: number }} | `enforceWriteInvariants`, `persistCoverageHoles`, `persistDomainModel`, `persistVocabulary`, `readCoverageLedger` | `../../schemas/index.mjs`, `./schema-validate.mjs` |
| `server/lib/estate-client-fake.mjs` | @param {object} fixtures @param {Array} [fixtures.clusters] Community objects (id/members/...). @param {Array} [fixtures.nodes] Node rows (symbol_id/name/kind/file/out_edges/...). @param {object} [fixtures.annotations] Map symbol_id -> [Annotation]. @returns {import("./estate-client.mjs").EstateClient & { writes: object }} | `makeFakeEstateClient`, `sampleFixtures` | `./estate-client.mjs` |
| `server/lib/estate-client.mjs` | @typedef {object} EstateClient @property {(params?: object) => Array} read_clusters @property {(name: string, opts?: object) => string[]} resolve @property {(opts?: object) => Array} list_nodes @property {(symbolId: string, type?: string) => Array} read_annotations @property {(key: string, value?: string) => string[]} find_by_annotation @property {(symbolId: string) => (object\|null)} source @property {(spec: object) => object} annotate @property {(symbolId: string, requirement: string, validated: boolean) => object} set_requirement | `EstateCliClient`, `appFromFile`, `normalizeNode` | — |
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
| `server/lib/memory-promoter.mjs` | Promotion policy for auto-memorizing wicked.garden.fact.extracted bus events. | `computeContentHash`, `promoteFact`, `slugify` | — |
| `server/lib/memory-subscriber.mjs` | Auto-memorize subscriber: bridges wicked-bus fact events into brain memories. | `fastForwardStaleCursor`, `renderMemoryFile`, `startMemorySubscriber` | `./bus.mjs`, `./memory-promoter.mjs` |
| `server/lib/mode-config.mjs` | Validate a mode.json body. Returns { ok, errors } — does not throw. Kept in lockstep with mode.schema.json. The schema is the canonical documentation; this is the runtime enforcement. | `MODE_FILE_PATH`, `diffMode`, `readModeFile`, `validateMode`, `writeModeFile` | — |
| `server/lib/onboard-wiki.mjs` | Onboard-wiki orchestrator. | `formatOnboardResult`, `runOnboardWiki` | `./detect-mode.mjs`, `./mode-config.mjs`, `./stamp-pointer.mjs` |
| `server/lib/project-id.mjs` | Canonical project-id slug + per-project brain resolution. | `baseName`, `projectId`, `resolvePerProjectBrain`, `slugifyId` | — |
| `server/lib/schema-validate.mjs` | Validate `data` against `schema`. `root` is the schema document used to resolve local `$ref`s (defaults to `schema`). @returns {string[]} error messages; empty array means valid. | `assertValid`, `validate` | — |
| `server/lib/sqlite-search.mjs` | Parse a source_hashes entry of the form "{chunk_path}: {hash}". Returns null if the shape doesn't match — malformed entries are skipped rather than blocking the whole verify call. | `SqliteSearch`, `deriveSourceType` | `./frontmatter.mjs`, `./wikilinks.mjs` |
| `server/lib/stamp-pointer.mjs` | CLAUDE.md / AGENTS.md contributor-wiki pointer stamping. | `buildSection`, `stampWikiPointer` | — |
| `server/lib/viewer-page.mjs` | Read-only HTML viewer for a wicked-brain instance. | `renderViewerHtml` | — |
| `server/lib/vocabulary.mjs` | @param {import("./estate-client.mjs").EstateClient} estate @param {object} [opts] @param {object} [opts.config] overrides for config.coverage.* kind-sets @param {number} [opts.minFreq] drop terms recurring fewer than this (default 1) @param {string} [opts.db] recorded in meta.bootstrap_run (provenance only) @returns {{ vocabulary: object }} | `isAbbreviation`, `mineVocabulary`, `tokenize` | `./domain-config.mjs` |
| `server/lib/wikilinks.mjs` | — | `parseWikilinks` | — |

