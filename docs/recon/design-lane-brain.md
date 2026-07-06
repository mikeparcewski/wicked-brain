# Lane C — wicked-brain re-cast (DESIGN)

> **Status:** DESIGN ONLY — no code changes in this doc. Falsifiable, grounded in real brain
> code (file:line). Reviewer + antagonist attack it next.
> **Charter basis:** `wicked-memory/docs/recon/knowledge-capability-agent-spec.md` (jobs/tools/contracts/skills)
> and `knowledge-program-DEFINE.md` §2 DoD-6 (cutover, retire-as-you-go), §3 Lane C, §8 (knowledge = 3rd MCP).
> **The thesis:** brain stops being a *store* and becomes a **skill-pack + reactive daemon** that **composes
> the 3 MCPs** (estate · memory · knowledge). It ADDS skills; it does not add tools. It DELETES the backends
> it replaces in the same change.

---

## 0. What brain is today (grounded inventory — the thing we are re-casting)

Brain has exactly three runtime components (`ARCHITECTURE.md:5`): a **skill layer** (markdown),
a **search server** (`server/bin/wicked-brain-server.mjs`), and an optional **LSP client**. The server is
a single `POST /api` dispatch table (`wicked-brain-server.mjs:137-314`) over five real backends:

| Backend | File(s) | What it does | Charter verdict |
|---|---|---|---|
| **FTS5 store** | `server/lib/sqlite-search.mjs` (48 KB, schema v5; `search()` @657, `index()` @469, `federatedSearch()` @781, `symbols()` @1154, `dependents()` @1195, `contradictions()` @1013, `searchMisses()` @1227, `confirmLink()` @1029) | The knowledge store: documents + `documents_fts` + `links` + `canonical_ownership` + `access_log` + `search_misses` | **RETIRE** → memory (recall/store) + knowledge MCP (doc/concept/typed-relation) |
| **Bespoke codegraph** | `server/lib/codegraph-{client,actions,index,nodes,extract,resolver}.mjs` + `codegraph-extractors/{bus,dispatch,capability}.mjs` | Shells `@colbymchenry/codegraph`, BFS over a per-repo SQLite graph; serves `graph-blast-radius`/`graph-callers`/`graph-lineage`/`graph-index` (`codegraph-actions.mjs:15-33`) | **RETIRE** → estate (`BlastRadius`, `TraverseGraph`, `ContextBundle`) |
| **LSP stack** | `server/lib/lsp-{client,manager,protocol,servers,helpers}.mjs` | Hand-rolled JSON-RPC to language servers; serves `symbols`/`refs`/`lsp-*` (`wicked-brain-server.mjs:184-254`) | **RETIRE** → estate (`SearchEntity`/`RetrieveEntity` over the indexed graph) |
| **Bus integration** | `server/lib/bus.mjs` + `server/lib/memory-subscriber.mjs` + `server/lib/memory-promoter.mjs` | `emitEvent()` fire-and-forget (`bus.mjs:53-65`); durable cursor subscriber on `wicked.fact.extracted` (`memory-subscriber.mjs:59-100`) | **KEEP + EXTEND** — this is the seed of the bus-drain reactive layer |
| **Viewer** | `server/lib/viewer-page.mjs` (37 KB, `renderViewerHtml()` @12) | Read-only HTML over `GET /` (`wicked-brain-server.mjs:336-342`); Search + Wiki tabs | **KEEP** — the C4 inspectability win; re-point it at the composed graph + event stream |

**Real MCP tool surfaces we compose onto** (grounded, not assumed):

- **estate** (`wicked-estate/crates/wicked-estate-mcp/src/lib.rs:244-252`): `SearchEntity`, `RetrieveEntity`,
  `TraverseGraph`, `BlastRadius`, `FetchContent`, `ContextBundle`, `SemanticSearch`, `RulesInventory`. Stdio
  JSON-RPC server (`README.md:131-141`). Lane A adds `rank`/`clusters`/`annotate` over MCP.
- **memory** (`wicked-memory/crates/wicked-memory-mcp/src/lib.rs:3,93-124`): `memory.recall`, `memory.learn`,
  `memory.capture`, `memory.reflect`, `memory.erase`, `memory.coverage`. Standalone-or-store-sharing
  (`wicked-memory/README.md:7`); already ships the **`skill://codebase-expedition/SKILL.md`** resource
  pattern (`wicked-memory-mcp/src/lib.rs:23`) — this is the pattern Lane C reuses.
- **knowledge** (the 3rd MCP, DEFINE §8 — modeled on memory): thin native verbs `ingest`, `write/relate`
  (typed C5 edges), `knowledge-recall`, `coverage`. Built by Lane B.

---

## 1. Backend swap + retirement plan

### 1.1 DECISIONS

**D1.1 — Brain becomes a composition layer, not a backend.** The re-cast brain server keeps exactly two
of its five backends (**bus** + **viewer**) and deletes the other three (**FTS5 store**, **codegraph**,
**LSP**). Everything brain used to *store and retrieve* is delegated to estate + memory + knowledge over
MCP. Brain's server shrinks from a 314-line dispatch table over a 48 KB SQLite store to a thin
**façade + reactive daemon** (§3) + viewer (§4).

**D1.2 — Brain ADDS skills, not tools (the thin-tools discipline, DEFINE §8).** Brain exposes **zero new
MCP tools**. Its unique value ships as `skill://` resources (§2) that *orchestrate the 3 MCPs' existing
tools*. This is the access-vs-overhead resolution: richness lives in on-demand skills, not resident tool
schemas. Brain is a **skill-pack** that an agent loads, plus a **daemon** that reacts to the bus.

**D1.3 — Feature→MCP retirement map (every retired feature has a named successor).**

| Retired brain feature (file:line) | Successor MCP tool/skill | Notes |
|---|---|---|
| `search` FTS5 (`sqlite-search.mjs:657`) | estate `SearchEntity` (BM25/FTS5 floor) ∪ memory `memory.recall` ∪ knowledge `knowledge-recall` | The C4 lexical floor stays first-class (estate `SearchEntity` is real FTS5). Brain's `search` skill becomes a *fan-out + fuse* skill (§2.4). |
| `federated_search` (`sqlite-search.mjs:781`) | memory **scope inheritance** (`wicked-memory/README.md:31`) + multi-store recall | Federation across brains → memory's org/unit/project scope model. Cross-brain `ATTACH` (`ARCHITECTURE.md:401`) retired. |
| `index` / `reindex` / `remove` (`sqlite-search.mjs:469,558,548`) | knowledge `ingest` + `write/relate`; memory `memory.capture` | Write path moves to knowledge MCP's thin write tools (DEFINE §8). Brain stops owning a store. |
| `symbols` / `refs` / `lsp-*` (`wicked-brain-server.mjs:184-254`) | estate `SearchEntity` + `RetrieveEntity` + `ContextBundle` | Estate indexes the code graph once; no per-query language-server spawn. |
| `graph-blast-radius` (`codegraph-client.mjs:66`) | estate **`BlastRadius`** | Direct semantic equivalent — both return transitive dependents. |
| `graph-callers` (`codegraph-client.mjs:73`) | estate `TraverseGraph` (depth=1, dependents) or `BlastRadius`+depth filter | Estate's `TraverseGraph` is bounded + relation-typed. |
| `graph-lineage` (`codegraph-client.mjs:80`) | estate `TraverseGraph` (dependencies direction) | |
| `graph-index` (`codegraph-actions.mjs:19`) | estate index (built by estate's own indexer) | Brain no longer shells `@colbymchenry/codegraph`; the whole resolver ladder (`codegraph-resolver.mjs:39`, `WICKED_CODEGRAPH_BIN`) is deleted. |
| `dependents` FTS (`sqlite-search.mjs:1195`) | estate `BlastRadius` / `TraverseGraph` | FTS-mention heuristic replaced by real graph edges. |
| `contradictions` (`sqlite-search.mjs:1013`) | knowledge typed `contradicts` relations (C5) + brain's **contradiction-hunting skill** (§2.3) | The typed-relation vocabulary is the C5 keystone. |
| `confirm_link` / link confidence (`sqlite-search.mjs:1029`) | memory `reinforce` (Wilson-score, `wicked-memory/README.md:26`) | Memory already has the confidence-on-confirm/contradict mechanic brain hand-rolled. |
| `search_misses` (`sqlite-search.mjs:1227`) | memory recall-miss log (Lane B) + brain **gap-hunt reaction** on `recall.missed` (§3.3) | Brain's `search_misses`→`enhance` loop is "stolen" by the spec (agent-spec §4); brain drives it via the bus. |
| `candidates` / promotion (`sqlite-search.mjs:932`, `memory-promoter.mjs`) | memory tiers + `memory.reflect` (consolidation) | Memory owns lifecycle/aging. |
| `wiki_list` / `verify_wiki` (`sqlite-search.mjs:1259,1305`) | knowledge `coverage` + viewer render (§4) | Wiki = synthesized knowledge nodes in knowledge MCP. |

**D1.4 — Retire-as-you-go ordering (DoD-6: old backends deleted in the *same change* that replaces them).**
The deletion order is dependency-driven and each step is independently green:

```
Step 0  Build the façade (§1.5) — new code, deletes nothing yet. Façade routes the
        consumer-facing actions/skills to the 3 MCPs. (additive; nothing breaks)
Step 1  RETIRE codegraph  → replace graph-* + graph-index with estate calls in the façade,
        DELETE codegraph-*.mjs + codegraph-extractors/ + resolver + WICKED_CODEGRAPH_BIN docs.
        (lowest blast radius — only wicked-garden consumes graph-*; façade keeps the verb)
Step 2  RETIRE LSP        → replace symbols/refs/lsp-* with estate SearchEntity/RetrieveEntity,
        DELETE lsp-*.mjs. (no external consumer depends on lsp-* — Explore confirmed)
Step 3  RETIRE FTS5 store → replace search/index/federated_search/etc. with memory+knowledge,
        DELETE sqlite-search.mjs + .brain.db + file-watcher's index path. (highest blast
        radius — gated behind the recall head-to-head proving memory ≥ brain, DoD-5/Lane Y)
Step 4  Re-point the viewer (§4) at the composed graph + event stream; DELETE viewer's
        direct sqlite-search reads.
```

Each step lands with: the successor wired in the façade **first**, the consumer-contract test green
(§1.6), the old module deleted in the **same commit**, brain `node --test` green.

**D1.5 — The compatibility façade (so consumers don't break).** Brain keeps its `POST /api` endpoint and
its `wicked-brain-call` CLI (`server/bin/wicked-brain-call.mjs`) and its skill *names*, but the handlers
behind them become **MCP clients** instead of SQLite calls. The action dispatch table
(`wicked-brain-server.mjs:137`) is preserved by *name and response shape* for the actions consumers
actually use, re-implemented as thin MCP adapters:

```
POST /api { action: "graph-blast-radius", params:{node} }
   ──→ façade ──→ estate MCP  BlastRadius(symbol=node)
                   ──→ reshape estate envelope → { node, dependents:[…], staleness }   (brain's old shape)
```

The façade is a stdio-MCP **client pool** (brain spawns/holds the 3 MCP servers, mirroring how it already
spawns LSP servers in `lsp-manager.mjs`). It composes — it does not re-expose. Graceful degradation is
preserved from `bus.mjs:25-40`: if an MCP is absent, the façade returns `engine: "unavailable"` exactly as
codegraph does today (`codegraph-client.mjs:59-63`), so consumers' existing degradation branches still fire.

### 1.2 RATIONALE
- Brain's own README sells "no vector DB, no embeddings, files + FTS5 + an LLM" (`README.md:9`). The
  charter bar (agent-spec line 12) is to **beat that with one move — typed relations (C5)** while keeping
  the simplicity wins (lexical floor, human-readable, miss-driven gaps, collapse-but-surface). Composition
  onto estate/memory/knowledge *delivers* those exact wins from purpose-built Rust engines: estate
  `SearchEntity` IS the FTS5 floor; memory `reinforce` IS confidence-on-confirm; knowledge typed edges ARE
  C5; the viewer IS human-readable. Brain keeps its identity by keeping the *behaviors*, not the *backends*.
- Retire-as-you-go (DoD-6) forbids a parallel-stack cutover. The façade-first / delete-same-commit ordering
  is the only way to satisfy "deleted in the same change" while keeping each commit green.
- Deleting codegraph first is the cheapest reversible step: it has exactly one real consumer (wicked-garden,
  §1.7) and the successor (`BlastRadius`) is a 1:1 semantic match.

### 1.3 RISKS
- **R1 (severity: HIGH) — node-id contract drift.** wicked-garden passes `file:<relpath>` and `function:<hash>`
  node ids (`wicked-garden/commands/search/blast-radius.md:40`, brain `wicked-brain-graph/SKILL.md`). Estate's
  `BlastRadius` takes a `symbol`/`SymbolId`, not codegraph's `file:` id scheme. The façade MUST translate
  ids both ways or garden's blast-radius command silently returns empty. *Falsifiable test:* §1.6 contract test.
- **R2 (MEDIUM) — estate must be present where brain runs.** Today codegraph degrades to `engine:"unavailable"`
  (`codegraph-client.mjs:59`). Post-swap, `graph-*` *requires* the estate MCP + an estate-indexed graph. If
  estate isn't installed, every garden graph command degrades — same failure surface, new root cause. Façade
  must emit the *same* `engine:"unavailable"` shape so garden's existing branch (`blast-radius.md:45`) still works.
- **R3 (MEDIUM) — FTS5 deletion is irreversible per-brain.** `.brain.db` is "rebuildable from markdown"
  (`ARCHITECTURE.md:277`) but the markdown chunks/wiki must first be migrated into knowledge/memory. Step 3
  needs a one-way migration (chunks→knowledge `ingest`, memory/→memory `capture`) gated behind Lane Y proof.
- **R4 (LOW) — performance regression from process hops.** SQLite in-process (`better-sqlite3`) → 3 stdio MCP
  round-trips. Sub-ms cross-brain joins (`ARCHITECTURE.md:401`) become IPC. Mitigation: ContextBundle is a
  one-shot tool (`wicked-estate-retrieve/src/context_bundle.rs:3` — "otherwise has to orchestrate four tools")
  so brain fuses fewer, fatter calls.

### 1.4 Consumer-migration risk (called out per the prompt)
Grounded from the consumer Explore (file:line below). **This is the riskiest part of the lane.**

| Consumer | How it depends on brain | Coupling | Breaks if… | Mitigation |
|---|---|---|---|---|
| **wicked-garden** | `npx -y wicked-brain-call graph-index / graph-blast-radius / graph-lineage / symbols` (`commands/search/blast-radius.md:29-40`, `lineage.md:25-31`, `index.md:25`); also `wicked-brain:memory` (store), `wicked-brain:search`, `wicked-brain:query` skill calls; `wicked.fact.extracted` emit (`WICKED_GARDEN_BUS_EVENTS.md`); health probe (`commands/setup.md`) | **HIGH** — graph commands are core to `search:*` | the `graph-*`/`symbols` action *names* or *response shapes* change, or `engine:"unavailable"` is no longer the degradation signal | Façade preserves `graph-*`/`symbols`/`stats`/`health` by name+shape (D1.5). Contract test (§1.6) freezes garden's exact call+parse. Migrate garden's `search:*` to estate-native MCP **after** the façade proves equivalent, then retire the façade verbs. |
| **wicked-testing** (the Writer) | `wicked-brain:search` skill (`agents/acceptance-test-writer.md:34-60`) **optional, graceful**; Executor HTTP `POST /api {action:search}` on `WICKED_BRAIN_PORT` (`agents/acceptance-test-executor.md:188-207`) **optional**; emits `wicked.testrun.step` | **LOW** — explicitly "brain is hint, plan is truth; degrade silently" | only if `search` action is *removed* (it isn't — façade keeps it) | Façade keeps `search`. No migration needed; the graceful-absence path already covers any hiccup. |
| **wicked-understanding** | `--enrich-from-brain` flag → `wicked-brain:query` agent (`skills/repo-analyst/SKILL.md`) **opt-in**; reachability probe on `localhost:4242` (`skills/repo-analyst/scripts/detect_brain.py`) | **LOW** — "lenses are source of truth; brain is opt-in enricher" | only if `query` skill or `health` is removed | Façade keeps `query` + `health`. No migration needed. |

**Migration sequencing:** the façade is the migration shim. Order: (1) ship façade keeping all consumer
verbs; (2) prove equivalence with the contract test; (3) migrate **wicked-garden** `search:*` commands to call
estate MCP directly (garden is the only HIGH-coupling consumer); (4) once garden is off the façade verbs,
optionally retire them. wicked-testing + wicked-understanding never need migration — their graceful-degradation
contracts (`acceptance-test-executor.md` "Bus/brain are optional — degrade silently") absorb the change.

### 1.5 OPEN QUESTIONS (backend swap)
- **OQ1 — Does brain spawn the 3 MCPs, or assume the host CLI already registered them?** estate/memory are
  registered as MCP servers in the *CLI* (`wicked-estate/README.md:133`). If the host already has them, brain
  re-spawning is wasteful/conflicting. *Leaning:* brain detects host-registered MCPs first (like the port
  probe in `wicked-brain-server.mjs:58`), spawns its own only as fallback. **Needs Lane A/B confirmation.**
- **OQ2 — Where does the façade live: in the Node server, or as a new skill that calls the MCPs?** A pure-skill
  façade (no server process) is more faithful to "brain = skill-pack," but consumers call `wicked-brain-call`
  (a CLI → HTTP server). *Leaning:* keep the thin server for the consumer-facing `POST /api` shim + the daemon;
  put all *richness* in skills. The server becomes a router, not a store.
- **OQ3 — `.brain.db` migration tool: one-shot script or a brain skill?** Step 3 needs chunks/wiki → knowledge.
  Is that a `wicked-brain:migrate`-style skill (one exists already, `skills/wicked-brain-migrate/`) re-pointed at
  knowledge MCP `ingest`? **Reuse the migrate skill.**

### 1.6 Falsifiable acceptance (backend swap)
- **AC-1.1 (consumer contract):** Run wicked-garden's exact sequence — `wicked-brain-call graph-index`, then
  `symbols --query X`, then `graph-blast-radius --node <id>` — against the **re-cast** brain. The returned JSON
  has the same top-level keys (`node`, `dependents[]`, `staleness`) the old shape had (`codegraph-client.mjs:69`)
  and the dependents match estate's `BlastRadius` for the same symbol. PASS = garden's parse code runs unchanged.
- **AC-1.2 (degradation parity):** With estate MCP absent, `graph-blast-radius` returns `engine:"unavailable"`
  (matching `codegraph-client.mjs:60`). PASS = garden's `blast-radius.md:45` branch fires identically.
- **AC-1.3 (deletion proof):** After Step 3, `git ls-files` shows `sqlite-search.mjs`, `codegraph-*.mjs`,
  `lsp-*.mjs` deleted; brain `node --test` green; no import of the deleted modules remains.

---

## 2. Combined-power skills (brain's unique value — span all 3 MCPs)

> These are the reason brain still exists post-swap. estate alone answers code questions; memory alone answers
> "what did we learn"; knowledge alone answers "what do the docs say." **Only a layer that holds all three at
> once** can answer "what breaks, and what did we decide about it, and does the doc still agree." These ship as
> `skill://` resources following the **codebase-expedition pattern** memory already uses
> (`wicked-memory-mcp/src/lib.rs:23` references `skill://codebase-expedition/SKILL.md`).

### 2.1 DECISIONS
**D2.1 — Four combined-power skills, all `skill://` resources, all tool-free.** Each skill is a method an agent
*executes* by orchestrating the 3 MCPs' existing tools. None adds a brain tool (D1.2). They live as SKILL.md
under brain's `skills/` and are also advertised as MCP `skill://` resources so any agent on any of the 3 servers
can pull them on demand.

| Skill | Spans | Replaces / extends |
|---|---|---|
| **change-impact** | estate (`BlastRadius`/`TraverseGraph`) + knowledge (`governs`/`depends-on` relations) + memory (`recall` decisions about the symbol) | brain `wicked-brain:graph` (`skills/wicked-brain-graph/`) — now also surfaces *governing rules* + *prior decisions* |
| **rationale-archaeology** | memory (`memory.recall` for decisions) + knowledge (`supersedes`/`refines` chains) + estate (code the rationale governs) | brain `wicked-brain:query` (`skills/wicked-brain-query/`) — now traces the *why* through typed supersession |
| **contradiction-hunting** | knowledge (`contradicts` C5 edges) + memory (contradicted/low-Wilson facts) + estate (which code each side touches) | brain `contradictions` action (`sqlite-search.mjs:1013`) + `wicked-brain:status` hotspots — now cross-source |
| **unified affordance / power-moves** | all three: "what can I do here" — estate `ContextBundle` + memory `coverage` + knowledge `coverage` | NEW — the brain-as-orchestrator index; the menu of combined moves |

### 2.2 Method outlines (grounded in real MCP tools)

**change-impact(symbol)** — "what breaks if I change X, and what governs it, and what did we decide."
1. Resolve `symbol` → estate `SearchEntity` (the FTS5 floor) → canonical `SymbolId`.
2. estate `BlastRadius(symbol)` → transitive dependents (the code blast radius; successor to
   `codegraph-client.mjs:66`).
3. knowledge `knowledge-recall(seeds=[symbol])` filtered to `governs`/`depends-on` typed edges (C5) →
   the *rules/contracts* that govern the dependents.
4. memory `memory.recall(query="why <symbol>", seeds=[symbol])` → prior **decisions** about this symbol
   (memory's cross-edge recall surfaces facts with zero lexical overlap, `wicked-memory/README.md:28-29`).
5. Fuse + cite: "Changing X breaks {dependents}; governed by {rules}; we previously decided {decisions}."
   Honor C4 (confidence/provenance visible, staleness surfaced from estate's `staleness` stamp).

**rationale-archaeology(topic|symbol)** — "why is it this way; what did this decision supersede."
1. memory `memory.recall(topic)` → decision facts, ordered by recency/salience.
2. knowledge traverse `supersedes`/`refines` typed relations (C5) → the *chain* of how the decision evolved
   (this is the "reason you can traverse by meaning" the spec promises, agent-spec line 13).
3. estate `RetrieveEntity`/`ContextBundle` → the code each decision-era touched, to ground the rationale.
4. Output a dated, cited supersession trail. Replaces the flat `wicked-brain:query` with a *typed* walk.

**contradiction-hunting()** — "where does our knowledge disagree with itself."
1. knowledge: enumerate `contradicts` C5 edges (successor to `sqlite-search.mjs:1013` which only found
   `contradicts` typed *links*; now cross-source).
2. memory: facts with low Wilson confidence / recent contradiction reinforcement
   (`wicked-memory/README.md:26`) — the experiential half.
3. For each contradiction pair, estate `BlastRadius` on the code each side references → blast radius of the
   disagreement ("this contradiction touches 12 call sites").
4. Rank by blast radius × confidence delta; emit for human review (collapse-but-surface, C1).

**unified-affordance(here)** — "what can I do with what I know about X." (the power-moves index)
1. estate `ContextBundle(seed)` → seed + ranked neighbors + budgeted stubs (one-shot,
   `context_bundle.rs:3`).
2. memory `memory.coverage(scope)` + knowledge `coverage` → how much is *known* vs *gap* here.
3. Compose a menu: available combined moves (change-impact / rationale / contradiction) pre-seeded with this
   context. This is the skill an agent loads first — the "table of contents" for brain's combined power.

### 2.3 RATIONALE
- The spec's own framing: the ontology work is "the same approach as code — an expedition"
  (agent-spec §3 step 1). memory already ships that expedition as a `skill://` resource
  (`wicked-memory-mcp/src/lib.rs:23`). Brain's combined skills are the *cross-MCP* expedition — the natural
  extension, and the one place all three graphs meet.
- Tool-free skills satisfy DEFINE §8's discipline: "richness lives in skills … leaning into skills *lowers*
  always-on context vs tools, while giving agents *more* access." Four resident tool schemas would bloat every
  session; four `skill://` resources cost nothing until pulled.
- These skills are the *only* net-new capability brain adds. Everything else is retirement. This keeps brain's
  scope honest (DEFINE §3 "Out: net-new engine capabilities beyond the catalog").

### 2.4 RISKS
- **R5 (MEDIUM) — fusion quality is unproven vs brain's current `search`+`query`.** Brain's `search` does
  union-find canonical collapse (`ARCHITECTURE.md:194-209`) the combined skills must replicate across 3 sources
  or duplicates inflate again. *Falsifiable:* AC-2.2.
- **R6 (LOW) — `skill://` resource discovery across 3 servers.** If a `skill://` is advertised by all three MCPs
  there could be name collisions. Brain's skills must namespace (`skill://wicked-brain/change-impact`).
- **R7 (MEDIUM) — the skills assume C5 typed edges exist.** Lane B must have written `governs`/`supersedes`/
  `contradicts` for these skills to traverse. On a fresh brain with no ontology, change-impact degrades to
  estate-only (still useful, but no rules/decisions). *This is acceptable graceful degradation*, but must be
  stated in each SKILL.md.

### 2.5 Falsifiable acceptance (skills)
- **AC-2.1 (change-impact, DEFINE §6 Lane C):** Seed a change on a symbol that has (a) dependents in estate,
  (b) a `governs` rule in knowledge, (c) a decision in memory. change-impact returns all three, cited. PASS =
  reviewer confirms the correct dependents + governing rule + decision appear.
- **AC-2.2 (no duplicate inflation):** Same fact present in a chunk + a wiki copy + a memory → combined recall
  surfaces it once with `also_found_in` (matching `ARCHITECTURE.md:206`), not three times.
- **AC-2.3 (degradation):** With knowledge MCP absent, change-impact still returns estate dependents and says
  "rules/decisions unavailable" — never errors.

### 2.6 OPEN QUESTIONS (skills)
- **OQ4 — Do the combined skills run *in brain's daemon* (reactive) or *in the calling agent* (on-demand)?**
  Some (change-impact) are agent-invoked; some (contradiction-hunting) are also daemon-triggered (§3). *Leaning:*
  same SKILL.md, two entry points — agent pulls `skill://`, daemon runs the same method on an event.
- **OQ5 — Citation format across 3 heterogeneous sources.** estate cites `file:line`, memory cites a fact id,
  knowledge cites a chunk/source digest. The skill needs one unified C3 recall-result shape. **Defer to Lane B's
  C3 contract; brain conforms.**

---

## 3. Bus-drain reactive layer

> Brain ALREADY drains the bus: `memory-subscriber.mjs` registers a durable cursor on `wicked.fact.extracted`
> (`memory-subscriber.mjs:59-64`), polls every 5 s (`pollIntervalMs:5000`), dedups by content hash, writes a
> memory file, and self-heals a TTL-stranded cursor (`fastForwardStaleCursor`, `memory-subscriber.mjs:125-160`).
> The reactive layer is **build-on-this**, not build-new.

### 3.1 DECISIONS
**D3.1 — Generalize the single subscriber into a multi-filter reactive daemon.** Today one subscriber, one
filter (`FACT_FILTER = "wicked.fact.extracted"`, `memory-subscriber.mjs:20`), one reaction (write memory). The
re-cast generalizes the `subscribe({db, plugin, filter, cursor_init, pollIntervalMs, handler, onError,
onDeadLetter})` pattern (`memory-subscriber.mjs:59`) into **N subscriptions → N reactions**, all using the same
wicked-bus durable-cursor mechanism brain already proved. Each reaction is a brain combined-skill method (§2) or
a maintenance method, run by the daemon.

**D3.2 — Four reactions, each on a real/named bus event.**

| Bus event (filter) | Source | Reaction | Grounded in |
|---|---|---|---|
| `wicked.fact.extracted` | garden/testing emitters (`WICKED_GARDEN_BUS_EVENTS.md`) | **consolidate** — promote fact → memory (KEEP existing `promoteFact`), then run `memory.reflect` periodically | `memory-subscriber.mjs:67-88` (exists) + memory `reflect` |
| `recall.missed` (thin/empty recall) | memory (Lane B emits) | **gap-hunt** — convert the miss into an ingest/discovery task; the spec's "mine recall misses" (agent-spec §4 step 2), brain's stolen `search_misses`→`enhance` | new subscription; reaction reuses brain's `enhance` skill (`skills/wicked-brain-enhance/`) |
| `estate.indexed` / ingest events | estate (Lane A coarse events, DEFINE §3 Lane A) | **re-link code↔knowledge** — for newly-indexed symbols, run the relation-typing pass (knowledge `write/relate`) linking code → concepts (`about`/`governs`); DEFINE §6 Lane C: "an `estate.indexed` event drains via bus and triggers a re-link reaction" | new subscription; reaction = knowledge `write/relate` |
| `wicked.*` typed-relation churn | knowledge (Lane B) | **curate the C5 vocabulary** — merge synonymous relation types, pin frequent, retire one-offs (agent-spec §4 step 4 + C5 lifecycle "emergent → curated") | new subscription; reaction = knowledge curation pass |

**D3.3 — Reuse the graceful-degradation + DLQ machinery as-is.** The daemon inherits `bus.mjs`'s silent-degrade
(`bus.mjs:54`), the DLQ inspection actions (`wicked-brain-server.mjs:290-301` `dlq_list`/`dlq_replay`/`dlq_drop`),
and the per-subscription `onDeadLetter` → `emitEvent("wicked.memory.dead_lettered", …)` pattern
(`memory-subscriber.mjs:92-99`). No new bus primitives. The TTL self-heal (`fastForwardStaleCursor`) is lifted to
apply per-subscription so any reaction recovers from an outage (at-least-once preserved).

**D3.4 — Reactions are fire-and-forget and idempotent.** Like the existing handler (dedup by content hash,
`memory-subscriber.mjs:71-77`), every reaction must be idempotent (re-link checks the edge exists; gap-hunt
dedups the task; curate is a merge). This honors at-least-once delivery without double-work.

### 3.2 RATIONALE
- The hardest parts of a bus-drain — durable cursors, TTL self-heal, DLQ, graceful degradation, idempotent
  dedup — are **already built and tested** in brain (`memory-subscriber.mjs`, `bus.mjs`). Generalizing one
  subscriber to N is a small, low-risk delta vs. a new daemon. This is the strongest "build on what exists" in
  the lane.
- The reactions map 1:1 to the spec's MAINTAIN job (agent-spec §4): consolidate, mine-misses, re-link,
  curate-vocabulary. Brain becomes the *engine* of MAINTAIN that the spec describes but doesn't run — exactly
  the "reactive daemon" the charter wants.
- `estate.indexed` → re-link is the integrated-scenario linchpin (DEFINE §6 Lane C + §2 DoD-4 "an event drains
  to brain and triggers a reaction"). It's the one reaction the whole program's integrated green depends on.

### 3.3 RISKS
- **R8 (MEDIUM) — event contract dependency on Lanes A & B.** `recall.missed`, `estate.indexed`, and the typed-
  relation-churn events don't exist yet — Lanes A/B must emit them (DEFINE §3 Lane A "emit coarse events", Lane B
  "emit events", track X "Rust→wicked-bus emit path"). If their names/payloads aren't pinned, brain's filters are
  guesses. *Mitigation:* brain's subscriptions are config-driven (filter strings), and DEFINE §4 says C integrates
  *after* A+B land — so the names are known by then. **Must confirm event names with A/B at design review.**
- **R9 (LOW) — reaction storms.** A bulk `estate.indexed` (whole-repo reindex) could fan out thousands of re-link
  reactions. *Mitigation:* the existing 5 s poll batches; add per-cycle caps (the subscriber already processes a
  bounded poll batch).
- **R10 (LOW) — the daemon competes with the host agent for MCP write access.** Daemon `write/relate` + an agent
  ingesting simultaneously → WAL contention. memory/knowledge are WAL (concurrent reader+writer,
  `wicked-memory/README.md:74`), so this is tolerable, but re-link writes should be small + retried.

### 3.4 Falsifiable acceptance (reactive layer)
- **AC-3.1 (DEFINE §6 Lane C):** Emit a synthetic `estate.indexed` event for a symbol. Within one poll cycle
  (≤5 s) the daemon writes a code↔knowledge `about` edge via knowledge `write/relate`, verifiable by a
  `knowledge-recall` seeded on that symbol. PASS = the link exists and recall surfaces it.
- **AC-3.2 (gap-hunt):** Force a thin recall → `recall.missed` emits → daemon creates an ingest/discovery task
  (dedup'd). PASS = task appears once even if the event redelivers (idempotency).
- **AC-3.3 (existing behavior preserved):** `wicked.fact.extracted` still promotes to a memory file exactly as
  `memory-subscriber.mjs:67-88` does today (regression guard on the KEEP path).

### 3.5 OPEN QUESTIONS (reactive layer)
- **OQ6 — Do reactions call MCPs directly, or emit a *task* an agent later executes?** Re-link is cheap+deterministic
  (daemon does it). The relation-*typing* pass needs LLM judgment (agent-spec §3 step 5) — the daemon can't run an
  LLM. *Leaning:* daemon does deterministic re-links (`about`/`mentions`); LLM-judgment reactions (typed `governs`,
  curate) **emit a task** the next agent session picks up. **This split needs a decision at review.**
- **OQ7 — One daemon process or one per brain?** Today the subscriber starts inside the per-brain server
  (`wicked-brain-server.mjs:416-426`). Multi-project (`README.md:236`) means N servers = N daemons. Is that fine,
  or does a meta-daemon federate? *Leaning:* per-brain (matches existing model), revisit if N gets large.

---

## 4. Viewer over live activity

> The viewer (`viewer-page.mjs`, `renderViewerHtml()` @12) is brain's C4 inspectability win — "human-readable,
> exportable to a diffable, eyeball-able view" (agent-spec C4). KEEP it; re-point it from the (retired) FTS5
> store to the composed graph + the live event stream.

### 4.1 DECISIONS
**D4.1 — Keep the viewer; swap its data source from `POST /api`-over-SQLite to `POST /api`-over-façade.** The
viewer is "dynamic via fetch at runtime" against the server's existing `POST /api` (`viewer-page.mjs:8-9`). Since
the façade (D1.5) preserves `POST /api` by name+shape, **the viewer's fetch calls keep working** — its Search tab
hits façade `search` (→ fused estate/memory/knowledge recall), its Wiki tab hits `wiki_list` (→ knowledge nodes).
Minimal viewer change: re-label, not re-architect.

**D4.2 — Add a live-activity panel fed by the bus.** New third tab/panel **"Activity"** rendering the recent
event stream the daemon drains: consolidations, re-links, gap-hunts, contradictions surfaced. Source = the bus
events (read-only) the daemon already sees, exposed via a new read-only `activity` action on the façade (mirrors
the existing read-only `dlq_list`, `wicked-brain-server.mjs:290`). This is the "viewer shows the live activity"
outcome (DEFINE §6 Lane C).

**D4.3 — Viewer stays read-only + localhost-only.** No change to the trust model (`README.md:124` "no auth,
localhost-only"). The `--read-only` gate (`wicked-brain-server.mjs:360`) still blocks writes; Activity is read-only
by construction.

### 4.2 RATIONALE
- The viewer is the cheapest, highest-value KEEP: it's already framework-free, build-free, fetch-driven against
  `POST /api` (`viewer-page.mjs:5-9`). Because the façade preserves that endpoint, the viewer needs almost no
  change to render the *composed* graph — it just renders whatever `search`/`wiki_list` now return.
- A live-activity window turns brain's daemon from invisible to inspectable — the C4 win the program wants
  (DEFINE §2 DoD bullet on inspectability; agent-spec C4 "human-readable / trust+debug win"). It's the visible
  proof the reactive layer is doing something.

### 4.3 RISKS
- **R11 (LOW) — Activity feed needs a bounded read.** Reading "recent events" from the bus must be capped/paged
  (the bus could have huge history). Reuse the `limit` pattern from `listBusDeadLetters` (`bus.mjs:109-119`).
- **R12 (LOW) — viewer shows stale graph if MCPs are down.** If estate/memory are unreachable, Search returns
  the façade's `engine:"unavailable"`. The viewer must render that gracefully (it already renders an empty state,
  `viewer-page.mjs:60-63`). Minor copy change.

### 4.4 Falsifiable acceptance (viewer)
- **AC-4.1 (DEFINE §6 Lane C):** Trigger a daemon reaction (e.g. a re-link from AC-3.1). The viewer's Activity
  panel shows that event within one refresh. PASS = the reaction is visible in the browser.
- **AC-4.2 (search still works):** Viewer Search tab returns fused results from the composed backends with the
  same result-card shape it renders today (`viewer-page.mjs:59`). PASS = a query shows hits with source chips.

### 4.5 OPEN QUESTIONS (viewer)
- **OQ8 — Does Activity read the bus DB directly (like `getBusDb()`, `bus.mjs:81`) or a daemon-maintained
  rolling buffer?** Direct read is simplest; a buffer decouples the viewer from bus internals. *Leaning:* direct
  read with a `limit`, consistent with `dlq_list`.

---

## 5. Summary of DECISIONS (the spine)

1. **D1.1/D1.2** Brain = skill-pack + reactive daemon + viewer. Composes estate·memory·knowledge over MCP.
   ADDS skills, ADDS **zero tools**, DELETES three backends.
2. **D1.3** Every retired feature has a named MCP successor (FTS5→memory+knowledge; codegraph→estate `BlastRadius`/
   `TraverseGraph`; LSP→estate `SearchEntity`/`RetrieveEntity`).
3. **D1.4/D1.5** Retire-as-you-go in 4 steps (codegraph→LSP→FTS5→viewer), each deletes-in-same-commit behind a
   **compatibility façade** that preserves `POST /api` + `wicked-brain-call` verbs by name+shape, with the same
   `engine:"unavailable"` degradation signal consumers already branch on.
4. **D2.1** Four tool-free `skill://` combined-power skills (change-impact, rationale-archaeology,
   contradiction-hunting, unified-affordance) — brain's only net-new value, spanning all 3 MCPs, codebase-expedition
   pattern.
5. **D3.1–D3.4** Generalize the existing `memory-subscriber.mjs` durable-cursor drain into an N-filter reactive
   daemon: consolidate / gap-hunt(`recall.missed`) / re-link(`estate.indexed`) / curate-C5. Reuse TTL self-heal +
   DLQ + graceful-degrade as-is; reactions idempotent + fire-and-forget.
6. **D4.1–D4.3** Keep the viewer; it rides the façade's preserved `POST /api` for free; add a read-only **Activity**
   panel over the live event stream.

## 6. The riskiest assumptions (what breaks downstream)

1. **[HIGHEST] wicked-garden's `graph-*`/`symbols` contract (R1, §1.4).** Garden is the only HIGH-coupling consumer.
   If the façade doesn't translate codegraph node-ids ↔ estate `SymbolId` and preserve the `{node, dependents,
   staleness}` shape + `engine:"unavailable"` signal, garden's `search:blast-radius`/`lineage`/`hotspots` commands
   silently break. **Falsified by AC-1.1/AC-1.2.** Mitigation: façade-first, contract test freezes garden's exact
   call+parse, migrate garden to estate-native only *after* equivalence proven.
2. **[HIGH] FTS5 deletion is gated on a thing this lane doesn't own (R3, DoD-5/Lane Y).** Step 3 (delete
   `sqlite-search.mjs`) can't land until the recall head-to-head proves memory ≥ brain. If Lane Y slips, brain
   can't complete cutover — Lane C's "old backends gone" (DEFINE §6) is blocked on Lane Y, not on Lane C's own work.
3. **[HIGH] Reactive layer depends on event names Lanes A/B haven't pinned (R8, §3.3).** `recall.missed`,
   `estate.indexed`, and typed-relation-churn events must exist with stable payloads. Brain integrates *after* A+B
   (DEFINE §4), but if those events aren't in the emit catalog, the re-link reaction (the integrated-scenario
   linchpin, DoD-4) has nothing to subscribe to.
4. **[MEDIUM] The LLM-judgment split in reactions (OQ6).** The daemon can't run an LLM, but the C5 relation-typing
   pass *requires* LLM judgment (agent-spec §3 step 5). If "daemon does deterministic re-links, emits tasks for
   typed/curate reactions" isn't accepted, the reactive layer either over-reaches (tries to type relations without
   a model) or under-delivers (only consolidates).
5. **[MEDIUM] Combined-skill fusion must not regress brain's collapse-but-surface dedup (R5, AC-2.2).** Brain's
   current `search` does union-find canonical collapse across 4 axes (`ARCHITECTURE.md:194-209`). The combined skills
   must replicate that across 3 heterogeneous sources or the program *loses* a brain simplicity-win the charter
   explicitly says to keep (agent-spec line 13).

## 7. Evidence trail (every load-bearing claim → file:line)
- Brain components: `ARCHITECTURE.md:5`, `wicked-brain-server.mjs:137-314,336-342,416-426`.
- FTS5 store surface: `sqlite-search.mjs:469,548,558,657,781,1013,1029,1154,1195,1227,1259,1305`.
- Codegraph: `codegraph-actions.mjs:15-33`, `codegraph-client.mjs:59-85`, `codegraph-resolver.mjs:39-59`,
  `codegraph-index.mjs`, `codegraph-extractors/`.
- LSP: `lsp-client.mjs`, `wicked-brain-server.mjs:184-254`.
- Bus drain (KEEP/EXTEND): `bus.mjs:25-65,81,109-171`, `memory-subscriber.mjs:20,59-100,125-160`,
  `memory-promoter.mjs:45-105`, `wicked-brain-server.mjs:290-301,416-426`.
- Viewer (KEEP): `viewer-page.mjs:5-12,59-63`.
- estate MCP tools: `wicked-estate/crates/wicked-estate-mcp/src/lib.rs:32,244-252`,
  `wicked-estate-retrieve/src/context_bundle.rs:3`, `wicked-estate/README.md:131-141`.
- memory MCP tools + skill:// pattern: `wicked-memory/crates/wicked-memory-mcp/src/lib.rs:3,23,93-124`,
  `wicked-memory/README.md:7,26,28-29,31,74`.
- Consumers: `wicked-garden/commands/search/{blast-radius,lineage,index}.md`,
  `wicked-garden/WICKED_GARDEN_BUS_EVENTS.md`, `wicked-garden/commands/setup.md`;
  `wicked-testing/agents/acceptance-test-{writer,executor}.md`;
  `wicked-understanding/skills/repo-analyst/{SKILL.md,scripts/detect_brain.py}`.
- Charter: `knowledge-capability-agent-spec.md` (§3,§4,§7, C1-C5, lines 12-13); `knowledge-program-DEFINE.md`
  (§2 DoD-4/5/6, §3, §4, §6, §8).
