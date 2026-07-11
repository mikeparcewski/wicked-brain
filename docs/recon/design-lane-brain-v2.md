# Lane C — wicked-brain re-cast (DESIGN v2)

> **Status:** DESIGN ONLY — no code in this doc. Every load-bearing claim is grounded (file:line).
> v2 folds the Lane C gate conditions (reviewer **C-C1/C-C2/C-C3**, antagonist **C-aB1…C-aB5**) onto the
> now-settled foundation (**DEC-1** separate stores + **Lane X xedge** PASS, **DEC-R** judgment-is-always-
> agent, the **pinned event-catalog-contract**).
>
> **Re-gated (this revision incorporates the verdicts):** Reviewer = **CONDITIONAL PASS** (substance sound;
> citation precision) — folded. Antagonist = **NO-GO, 4 BLOCKING** — all folded: **B-1** the merge must key
> on `provenance` not `cross_edge_kinds` (injected edges are `kind="references"`) → §1A + AC-1.1; **B-2** the
> extractor re-home is a REWRITE + brain must mint `function:<hash>` (codegraph-minted today) before the
> codegraph delete → DEC-C1a + AC-1.6; **B-3** the about-arm is a HARD ship-gate on Lane A's epoch (not a MED
> risk) → R7 + AC-3.1 negative; **B-4** `equiv()`'s cross-source carrier is a brain-owned text hash, not the
> circular xedge-identity arm nor the single-store `findByContentHash` → DEC-C4 + AC-2.2 on an empty overlay.
> Advisories A-1 (staleness from `git rev-list`, not the drift event) + A-3 (no prose in shim `signature`)
> folded. The service-map correction (A-4) was confirmed correct by both. See §9 for the full re-gate ledger.
>
> **Every assertion is tagged:**
> - **`[PROVEN-IN-DESIGN]`** — true today, verified against real code at the cited file:line; no build needed to know it holds.
> - **`[BUILD-GATE]`** — a claim that is only *designed*; it must be proven by a named test/bench before it can be trusted. Never asserted as fact.
>
> **Charter basis:** `wicked-memory/docs/recon/knowledge-program-DEFINE.md` §2 DoD-4/5/6, §3 Lane C, §6, §8;
> `knowledge-capability-agent-spec.md` (C1–C5).
> **Foundation:** `design-gate-verdicts.md` — Lane X GATE = PASS (the xedge overlay; lines 66–92), DEC-1
> (line 97), DEC-R (line 95), DEC-0 HOLD-MAXIMAL-SCOPE (line 96).
> **Pinned events:** `wicked-memory/docs/recon/event-catalog-contract.md`.

---

## 0. What changed since v1 (the deltas this revision must absorb)

v1 (`design-lane-brain.md`) made five claims the gate **falsified or under-specified**. v2 carries the
correction for each, and inherits four foundation decisions that did not exist when v1 was written:

| v1 said | The gate found | v2 does |
|---|---|---|
| codegraph→estate `BlastRadius` is "a 1:1 semantic match" (v1 §1.3 D1.3 row, line 64) | **C-aB1:** estate `BlastRadius` is **Calls-reachability only**; it cannot produce garden's `injected:dispatch/bus/capability` + `archetype` edges → silent under-report | **§1A:** brain KEEPS the injected-edge extractors as a **façade merge layer** over estate (DEC-C1). AC-1.1 rewritten to assert injected-edge **fidelity** on a fixture. |
| "the façade MUST translate ids both ways" (v1 R1, line 126) — named, not specified | **C-C1/C-aB2:** different schemas, no `file:path→SymbolId` resolver, NO top-level `node`, NO `staleness` object on the estate side; the documented direct `--node "file:<path>"` path silently empties | **§1B:** the full bidirectional id+field map + the direct-path resolver, both AC'd (AC-1.4). |
| "only wicked-garden consumes graph-*" (v1 §1.2, line 122; D1.4 Step 1, line 83) | **C-aB3/C-C2:** `search:hotspots` + `search:service-map` + **wicked-patch** read `.codegraph/codegraph.db` **off disk** — the verb-façade can't shield them | **§1C:** a DB-compat shim materializing `.codegraph` from estate + injected edges; hotspots sequenced onto it; the codegraph delete gated on the shim being green. |
| AC-3.3 guards the `wicked.fact.extracted`→memory KEEP path (v1 §3.4, line 344) | **C-aB5:** garden's gate4 (`gate4-cutover-matrix.md` FLAG 2) lists "accept that per-session auto-memorize dies" as a defensible option — two lanes hold contradictory plans for one event | **§3D:** declared a cross-lane dependency; brain's KEEP path depends on garden retaining the producer; if garden retires it, brain's auto-consolidate is **out-of-scope** and `wicked-brain:memory` (explicit) remains. AC-3.3 rewritten. |
| OQ6 left open (daemon can't run an LLM; C5 typing needs one) (v1 §3.5, line 348) | **DEC-R (line 95):** judgment is ALWAYS agent-via-skill/task; deterministic lifecycle is ALWAYS engine/daemon — one rule | **§3A/§3C:** the daemon does **deterministic** `about`/`mentions` re-links only; typed `governs`/curate are **emitted agent TASKS**. Stated as the integrated-scenario contract. No LLM in the daemon, ever. |
| (v2-draft) merge keyed on `cross_edge_kinds=["injected:bus",…]` | **Antagonist B-1:** injected edges are `kind="references"` with the discriminator in **`provenance`** (`bus.mjs:172-175`); a kind-keyed traverse returns ∅ → C-aB1 regression re-created one layer down | **§1A:** merge selects by `provenance LIKE 'injected:%'`; AC-1.1 forbids the kind-keyed harness. |
| (v2-draft) extractors "KEEP, re-pointed"; hashes "brain-minted today" | **Antagonist B-2:** `function:<hash>` is **codegraph-minted** (`wicked-brain-graph/SKILL.md:37-38,52-54`); extractors anchor on the codegraph `nodes` table the deleted builder populates — a chicken-and-egg | **§1A DEC-C1a:** Step 1a builds a brain-owned minter + REWRITES the extractors (overlay + shim sinks) BEFORE the Step 1b delete; AC-1.6 proves fidelity with codegraph absent. |
| (v2-draft) about-arm epoch dep = MED risk; `equiv()` "brain already does this" | **Antagonist B-3/B-4:** epoch-inert → first-shipping about-arm bug LIVE + AC vacuous at 0 (verdicts :86); `equiv()` xedge-arm circular + the cited dedup is single-store (`memory-subscriber.mjs:72`) | **R7** promoted to a HARD ship-gate on Lane A epoch (+ AC negatives); **DEC-C4** carrier = a brain-owned cross-engine text hash (non-circular), AC-2.2 on an empty overlay. |

Foundation decisions inherited (did not exist for v1):

- **DEC-1 (line 97):** separate stores + a first-class **xedge** overlay. Cross-source links are NOT native
  FKs — they are read-time lookups against `xedge.db` keyed `(engine, stable-id)`. `[PROVEN-IN-DESIGN]`
  (Lane X GATE = PASS, line 92).
- **Lane X (GATE = PASS at line 92):** the overlay ships `traverse_multi` (a 28th `GraphRead` method), a
  default-OFF `cross_edge_kinds` gate, `recall()` defaulting `["about"]`, identity-epoch reuse-safety, and a
  query-latency + `cross_engine_recall@k` bench gate — all resolved/landed at `design-gate-verdicts.md:81`
  and carried into build at `:90` (NOTE: lines 68/74 are where these terms first appear *as the v1 defects*
  — `traverse_multi` "does NOT exist", the bounding "is backwards"; the *resolution* is `:81`/`:90`/`:92`).
  Brain's combined-power skills (§2) **consume xedge** for cross-source.
- **DEC-R (line 95):** no engine/daemon LLM. Resolves OQ6.
- **event-catalog-contract.md:** the pinned `wicked.*` filter names. Resolves v1's C-aB4 (brain was
  subscribed to regex-illegal `estate.indexed`/`recall.missed`).

> **The thesis is unchanged and survives the gate:** brain stops being a *store* and becomes a
> **skill-pack + reactive daemon + viewer** that **composes** estate · memory · knowledge over MCP, plus a
> **thin merge/shim layer** for the two things composition alone can't deliver (injected edges; off-disk
> `.codegraph` readers). It ADDS skills; it ADDS zero MCP tools; it DELETES the backends it replaces in the
> same change — but only after each successor is **proven**, not assumed.

---

## 1. Backend swap + retirement (revised)

### 1.0 The retirement map (unchanged in intent, corrected in two rows)

`[PROVEN-IN-DESIGN]` Brain has exactly five runtime backends behind one `POST /api` dispatch table
(`server/bin/wicked-brain-server.mjs:137-314`): FTS5 store (`sqlite-search.mjs`), bespoke codegraph
(`codegraph-*.mjs` + `codegraph-extractors/`), LSP stack (`lsp-*.mjs`), bus integration (`bus.mjs` +
`memory-subscriber.mjs`), viewer (`viewer-page.mjs`). The v1 map (its §1.1 D1.3 table) stands **except**
two rows, corrected below:

| Retired feature | v1 successor | v2 correction |
|---|---|---|
| `graph-blast-radius` (`codegraph-client.mjs:66`) | estate `BlastRadius` "direct semantic equivalent" | **WRONG (C-aB1).** estate `BlastRadius` = Calls-reachability; it omits injected edges. Successor = estate `BlastRadius` **merged with brain's retained injected-edge extractors** (§1A). |
| `graph-index` (`codegraph-actions.mjs:19`) — "Brain no longer shells codegraph; the whole resolver ladder is deleted" | delete codegraph wholesale | **PARTIAL (C-aB3/C-C2).** The codegraph **walker/resolver** retires, but `.codegraph/codegraph.db` is **consumed off-disk** by hotspots/service-map/wicked-patch. A DB-compat shim must materialize it from estate (§1C) **before** the file producer is deleted. |

All other retirements (LSP→estate `SearchEntity`/`RetrieveEntity`; FTS5→memory+knowledge;
`federated_search`→memory scope; `confirm_link`→memory `reinforce`; `contradictions`→knowledge `contradicts`
+ §2.3 skill; etc.) are unchanged from v1 §1.1 and remain `[PROVEN-IN-DESIGN]` as *named successors*
(their *behavioral parity* is `[BUILD-GATE]`, gated per row by the §1.6 contract tests).

---

### 1A. The injected-edge fidelity problem (folds C-aB1 — THE silent regression)

**The fact.** `[PROVEN-IN-DESIGN]` garden's blast-radius value is NOT static dependents — it is the
**injected edges grep cannot see**: `injected:dispatch` (command→agent), `injected:bus`
(consumer→producer), `injected:capability` (agent→capability), plus garden's own **archetype** drop-in.
This is asserted verbatim in the consumer surface:
- `wicked-garden/commands/search/blast-radius.md:42`: "*The `dependents` array includes relationships grep
  can't see: a command that dispatches an agent (`injected:dispatch`), a consumer that subscribes to an event
  (`injected:bus`), an agent that declares a capability (`injected:capability`).*"
- `blast-radius.md:58`: garden contributes **archetype** edges via `.codegraph-extractors/archetype.mjs`,
  "discovered by brain's registry — so archetype→playbook relationships are in the blast radius too."
- These edges are **written into codegraph's SQLite by brain's own extractors**, each stored with
  `kind="references"` and a distinct **provenance** discriminator (the load-bearing detail for §1A's merge):
  - `codegraph-extractors/bus.mjs:30` (`INJECTED_PROVENANCE = "injected:bus"`; edge insert at `bus.mjs:172-175`;
    reads `_bus_consumers.json` + greps `(wicked|wg)\.` event-string literals; direction corrected to
    source=consumer→target=producer, `bus.mjs:5-19`).
  - `codegraph-extractors/dispatch.mjs:21` (`"injected:dispatch"`; edge insert at `dispatch.mjs:111-115`;
    `subagent_type` regex at `dispatch.mjs:25`).
  - `codegraph-extractors/capability.mjs:24` (`"injected:capability"`; OWNS synthetic `capability:<name>`
    nodes, `capability.mjs:14-19`).
  - garden drop-in `.codegraph-extractors/archetype.mjs:61` (`"injected:archetype"`, also `kind="references"`).

`[PROVEN-IN-DESIGN]` estate's `BlastRadius` produces NONE of these. estate is a code-graph engine over
Calls/Imports/References edges; it has never run garden's extractors and has no `_bus_consumers.json`,
`subagent_type`, `tool-capabilities`, or archetype awareness. (Lane A's scope, DEFINE §3, is
rank/clusters/annotate + coarse events — **not** injected-edge absorption.) Therefore a naive swap returns
**the same envelope shape with a silently smaller `dependents` set** — under-reporting impact and firing no
degradation signal. v1's AC-1.1 (top-level key parity) would **pass on this regression**.

#### DEC-C1 — KEEP brain's injected-edge extractors as a façade MERGE layer over estate (do NOT have Lane A absorb them)

The prompt's fork: *keep brain's extractors as a façade that merges onto estate reachability* **OR** *Lane A
absorbs injected edges into estate*. **DECISION: keep the extractors in brain as a merge layer.**

Rationale (grounded):
1. **The extractors are garden-coupled, not code-graph-general.** They parse garden's wire conventions —
   `subagent_type: plugin:domain:name` (`dispatch.mjs:25`), garden's `_bus_consumers.json` +
   the `(wicked|wg)\.` event regex (`bus.mjs:29`), `tool-capabilities:` frontmatter
   (`capability.mjs:CAPS_BLOCK_RE`), and the **archetype drop-in is literally garden's file**
   (`blast-radius.md:58`, `.codegraph-extractors/archetype.mjs`). Pushing these into estate's Rust core
   would make a general multi-language code-graph engine carry one downstream plugin's archetype taxonomy —
   a layering violation, and it would re-introduce in estate exactly the "garden-specific edge kinds"
   coupling Lane A was scoped to avoid. DEC-1's whole shape (separate stores, overlay for cross-domain) says
   domain-specific links live in an **overlay**, not the core engine.
2. **It is a small, retained, already-built capability** — three extractor files + a registry that already
   runs them in one pass (`blast-radius.md:27` "*brain builds the codegraph static graph + runs the
   injected-edge extractors in one pass*"). KEEP is strictly less work than a Lane A absorb + a cross-lane
   re-pricing.
3. **It composes cleanly:** estate gives the static reachability (the part it's good at); brain's merge layer
   adds the injected dependents on top. This is the same "compose, don't re-implement" discipline as the rest
   of the lane.

**What this changes vs v1's "delete codegraph wholesale" (v1 D1.4 Step 1, line 82):**
- **RETIRE:** the codegraph **static graph builder + BFS walker + resolver ladder** (`codegraph-client.mjs`
  walk/blastRadius/lineage @66-85, `codegraph-resolver.mjs:39`, `WICKED_CODEGRAPH_BIN`, the shelling of
  `@colbymchenry/codegraph`). The static reachability is now estate's job.
- **KEEP (re-homed — and this is a REWRITE of their I/O contract, not a re-point; see DEC-C1a):**
  `codegraph-extractors/{bus,dispatch,capability}.mjs` + garden's archetype drop-in, re-pointed to read
  estate-minted nodes and **emit injected edges into the xedge overlay** (DEC-1), rather than into a private
  codegraph SQLite. The merge happens at read time in the façade.

#### DEC-C1a — the extractor re-home is a REWRITE gated as Step-1a work (folds antagonist B-2, the chicken-and-egg)

`[PROVEN-IN-DESIGN]` The extractors as built are **hard-wired to a codegraph SQLite that the codegraph static
build populates** — they cannot simply be "re-pointed":
- They `INSERT INTO edges (source,target,kind,metadata,provenance)` into the codegraph DB (`bus.mjs:139-140`,
  `dispatch.mjs:75-76`, `capability.mjs` analogous), and they **confirm endpoints exist** against the
  codegraph `nodes` table (`bus.mjs:148-160` via `fileNodeId(db,...)`; dispatch/capability/archetype anchor
  via `ensureFileNode`/`ensureVirtualNode`, which `INSERT OR IGNORE INTO nodes`, `codegraph-nodes.mjs:14-19,
  37-42`). The bus producer-grep **skips** any edge whose file node is absent (`bus.mjs:149-152`).
- `[PROVEN-IN-DESIGN]` **`function:<hash>` is codegraph-minted, NOT brain-minted.** The graph skill is explicit:
  node ids "follow **codegraph's** convention — e.g. `file:src/app.py`, or a symbol id like `function:<hash>`"
  (`skills/wicked-brain-graph/SKILL.md:37-38`), "Backed by the **`@colbymchenry/codegraph` CLI**"
  (`SKILL.md:52-54`). Brain's `codegraph-nodes.mjs` only ever mints `file:<relpath>` and virtual
  `capability:`/`archetype:` nodes (`:37,57`) — it never mints `function:<hash>`.

So Step 1b (delete the codegraph builder) removes **both** the thing that mints `function:<hash>` **and** the
`nodes` table the extractors anchor against. v1's "KEEP, re-pointed" (and the v2 first-draft's casual
re-home) was wrong: it is a **rewrite** of the extractor I/O contract — different store (xedge), different
schema, a new node-existence source (estate, not the codegraph `nodes` table), and a brain-owned
`function:<hash>` minter to replace codegraph's.

**Therefore the sequence is hard:**
```
Step 1a  Build, as NEW code, BEFORE any delete:
         (i)   a brain-owned node minter: estate entities → file:<relpath> (from estate file nodes)
               and function:<stable-hash(SymbolId)> (brain mints the hash deterministically from the
               estate SymbolId + epoch — replaces codegraph's tree-sitter hash). This feeds §1B's memo.
         (ii)  rewrite the 3 extractors + archetype drop-in to (a) resolve their endpoints against the
               estate-minted node set, and (b) write edges to BOTH targets they now serve:
                  - the xedge overlay (for the §1A façade merge), and
                  - the §1C shim's legacy-shaped .codegraph (so hotspots/wicked-patch read them).
               One extractor pass, two sinks — reconciled here, not hand-waved.
         Prove (i)+(ii) green on the AC-1.1 fixture. additive; nothing deleted yet.
Step 1b  ONLY NOW delete the codegraph static builder/walker/resolver + WICKED_CODEGRAPH_BIN +
         the @colbymchenry/codegraph shell. The minter (i) + rewritten extractors (ii) already
         supply what the static build used to.
```
This makes the dependency explicit: **the minter + extractor-rewrite is a build-gate that MUST be green
before Step 1b**, not a "re-point." (AC-1.6, below.)

#### The merge mechanism (the façade's blast-radius path — keyed on PROVENANCE, folds antagonist B-1)

`[PROVEN-IN-DESIGN]` **The injected edges are stored with `kind="references"`; the discriminator is the
`provenance` column, NOT the edge kind.** Verified in every extractor:
- `bus.mjs:172-175`: `insertEdge.run(consumerNodeId, producerNodeId, "references", …, INJECTED_PROVENANCE)`
  where `INJECTED_PROVENANCE = "injected:bus"` (`bus.mjs:30`).
- `dispatch.mjs:111-115`: `insertEdge.run(src, tgt, "references", …, INJECTED_PROVENANCE)`,
  `"injected:dispatch"` (`dispatch.mjs:21`).
- `capability.mjs`: same, `"injected:capability"` (`capability.mjs:24`).
- garden `archetype.mjs:61`: `insert.run(src, tgt, "references", …, PROVENANCE)`, `"injected:archetype"`.
- The off-disk consumer agrees: `hotspots.md:37` filters injected edges by **`provenance LIKE 'injected:%'`**,
  never by `kind` (the SQL discriminates on `kind != 'contains'`, `hotspots.md:25-28`).

There is **no edge whose `kind` is `injected:bus`.** So the merge MUST select injected edges by **provenance**,
not by `cross_edge_kinds` (an edge-kind gate, `design-gate-verdicts.md:81`). A `cross_edge_kinds=["injected:bus",
…]` traverse returns the empty set and re-creates the C-aB1 silent regression one layer down. Corrected path:

```
POST /api { action:"graph-blast-radius", params:{ node } }
  ──→ façade.blastRadius(node):
        sym     = resolve(node)                                # §1B id map → estate SymbolId (+epoch)
        static  = estate.BlastRadius(symbol = sym)             # Calls/Imports/Refs reachability
        injected = xedge.traverse(seed = sym,                  # brain's extractor output, in the overlay
                     cross_edge_kinds = ["references"],         # injected edges are kind="references"
                     provenance_filter = "injected:%")         # the DISCRIMINATOR — brain-owned predicate
        ──→ MERGE(static, injected)  →  reshape → { node, dependents:[…], staleness }   # v1 brain shape
```

`[BUILD-GATE]` the overlay read uses Lane X's `traverse_multi`/`neighbors`-override union (shipped at
`design-gate-verdicts.md:81`, PASS at `:92`) with the default-OFF cross-edge gate **opted IN by this code
tool** (`:84` — opt-IN for code tools). **NEW seam requirement:** the overlay traverse must accept a
`provenance LIKE` predicate (or brain post-filters the overlay rows by provenance after a `kind="references"`
traverse). If Lane X's `traverse_multi` cannot filter by provenance, brain reads the overlay's injected rows
directly and post-filters — either way the selection key is `provenance`, asserted by AC-1.1. The MERGE is a
brain-owned set-union via `equiv()` (§2.3): same `(engine, stable-id)` key → one dependent, provenance list
merged.

> **Why xedge and not a retained private codegraph DB?** Because §1C *also* needs these edges materialized
> for the off-disk consumers, and DEC-1 already mandates one cross-domain overlay. Two stores for the same
> injected edges would re-create a sync bug. The extractors write once (Step 1a) → BOTH the overlay (façade
> merge, §1A) and the shim (.codegraph, §1C) read from there.

#### AC-1.1 — REWRITTEN to assert injected-edge FIDELITY (was structural key-parity)

> **AC-1.1 `[BUILD-GATE]` (injected-edge fidelity, PROVENANCE-keyed).** Fixture: a repo with (a) a command
> that `subagent_type`-dispatches an agent, (b) a consumer in `_bus_consumers.json` for an event a producer
> emits, (c) an agent with a `tool-capabilities:` block, (d) garden's archetype drop-in present. Index it
> through the re-cast brain. `graph-blast-radius --node <agent>` MUST return the dispatching command among
> `dependents` with `provenance:"injected:dispatch"`; `--node <producer>` MUST return the consumer with
> `provenance:"injected:bus"`; `--node <capability:X>` MUST return the declaring agent. **PASS = the injected
> dependents are present with correct provenance AND the static dependents are present — set-equality against
> the pre-swap brain output on the same fixture.** **The test MUST verify the façade selects injected edges by
> the `provenance` predicate (the edges are `kind="references"`, `bus.mjs:172-175`) — a harness that queries
> by `cross_edge_kinds=["injected:bus"]` would falsely pass against an empty result and is forbidden;
> assert the provenance-keyed path returns the four edge classes.** Structural key-parity
> (`node`/`dependents`/`staleness` present) is explicitly NOT sufficient and is a *secondary* check only.
> This test is designed to FAIL against (i) a naive estate-only swap and (ii) a kind-keyed merge that misses
> the provenance discriminator (both = the C-aB1 regression).

> **AC-1.6 `[BUILD-GATE]` (minter + extractor-rewrite before delete — gates Step 1b, folds B-2).** Before the
> codegraph builder is deleted: (a) the brain-owned node minter produces `file:<relpath>` AND
> `function:<stable-hash(SymbolId,epoch)>` nodes from estate entities, with no dependency on
> `@colbymchenry/codegraph`; (b) the rewritten extractors resolve their endpoints against the **estate-minted**
> node set (NOT a codegraph `nodes` table) and write injected edges to **both** the xedge overlay and the §1C
> shim DB; (c) AC-1.1 passes with the codegraph static builder already removed from the code path (run the
> fixture with `WICKED_CODEGRAPH_BIN` unset). **PASS = injected-edge fidelity holds with codegraph absent.**
> This proves the chicken-and-egg is resolved: nothing in the injected-edge path still needs the deleted
> builder.

---

### 1B. Bidirectional node-id + field-shape translation (folds C-C1 + C-aB2)

**The fact (grounded both sides).**
- `[PROVEN-IN-DESIGN]` **Consumer/codegraph side** speaks `file:<relpath>` and `function:<hash>` node ids
  (`blast-radius.md:33,40`: "*Node ids are `file:<relpath>` for files, or `function:<hash>` etc. for
  symbols … `graph-blast-radius --node "file:<path-or-resolved-id>"`*"). The envelope is
  `{ node, dependents:[{…}], staleness }` (`codegraph-client.mjs:69` blastRadius return) — a **top-level
  `node`**, a flat `dependents` array, and a **`staleness` object**. `codegraph_db.py:75` confirms the row
  shape codegraph persists: `nodes(id, name, kind, file_path, start_line, end_line, signature)` and
  `edges(source, target, kind)`.
- `[PROVEN-IN-DESIGN]` **estate side** (per the verdicts ledger C-aB2, `design-gate-verdicts.md:37`, and
  Lane A's surface): entities are `{symbol, name, kind, file, line}` + a `summary`, with **no top-level
  `node`** and **no `staleness` object**; there is **no `file:path → SymbolId` resolver**, only a lossy
  `SearchEntity`. estate's `BlastRadius` keys on `SymbolId`.

So two gaps, both of which silently empty the consumer if unhandled:
1. **id space:** `file:<relpath>` / `function:<hash>` ↔ estate `SymbolId`.
2. **field shape:** estate `{symbol,name,kind,file,line}` ↔ codegraph `{id,name,kind,file_path,start_line,end_line}`,
   plus synthesizing the top-level `node` and the `staleness` object the consumer parses.

#### DEC-C2 — the translation is a brain-owned, deterministic, bidirectional resolver in the façade

**Inbound (consumer id → estate query):**

| consumer node id | resolution | estate call |
|---|---|---|
| `file:<relpath>` | **direct path resolver** (the explicitly-AC'd path) — normalize `<relpath>` (forward-slash, repo-relative per CLAUDE.md), then estate `SearchEntity(kind=file, path=<relpath>)` → the file-node `SymbolId`. If estate has no file-granular node, fall back to `RetrieveEntity` by path; if still none → **loud empty** (see below), never silent. | `BlastRadius(symbol=<resolved SymbolId>)` |
| `function:<hash>` / bare symbol name | `SearchEntity(query=<name>)` → rank → top `SymbolId`; if the consumer passed a `function:<hash>` brain minted, brain keeps a **hash↔SymbolId memo** (built at index time, see below) and resolves directly. | `BlastRadius(symbol=<SymbolId>)` |

**The `file:<path>` direct path is the one C-aB2 calls out as silently empty.** `[BUILD-GATE]` It is made
real here by a **file-node resolver** (estate indexes files as nodes; `SearchEntity(kind=file)` returns them)
and is **explicitly AC'd** (AC-1.4 below). If estate's `SearchEntity` cannot resolve a file path to a node,
the façade returns a **typed non-empty diagnostic** — `{ node, dependents:[], staleness, resolve:"unresolved",
reason:"no estate node for file:<path>" }` — NOT a bare empty `dependents` (which the consumer would read as
"nothing depends on this"). This is the silent-failure fix: a resolution miss is loud, a real zero is
`resolve:"ok", dependents:[]`.

**Outbound (estate entity → consumer envelope):**

```
estate BlastRadius → { results:[ {symbol, name, kind, file, line, summary}, … ], … }
  ──→ façade reshape, per dependent:
        { id:        synthesize(symbol),        # "file:<file>" if kind==file else "function:<stable-hash(symbol)>"
          name,                                  # passthrough
          kind,                                  # passthrough
          file_path:  file,                      # estate `file`  → consumer `file_path`
          start_line: line, end_line: line }     # estate single `line` → consumer start/end (end=line when estate has no span)
  ──→ envelope: { node: <the inbound node id, echoed>,         # synthesize the top-level `node` v1 had
                  dependents: [ …reshaped… ],
                  staleness: deriveStaleness() }                # see below
```

**`staleness` synthesis `[BUILD-GATE]` (folds A-1 — must NOT default-to-fresh on a null drift event):** the
consumer parses `staleness` (`blast-radius.md:31,42`; `codegraph-client.mjs:69` returns it on every call).
Today brain computes it locally and correctly via `git rev-list --count --since=<db mtime>`
(`codegraph-index.mjs:20-26`) — a real freshness computation, not an event. estate has no `staleness` object
but emits `wicked.estate.drifted {db_path, commits_behind, ts}` (event-catalog-contract.md:18) **only when it
drifts** — so on a freshly-indexed repo no drift event has fired and "last-seen drift event" is null.
**Therefore the façade derives `staleness` from an on-demand freshness computation, NOT from the (possibly
absent) drift event:** brain re-uses its own `git rev-list --count --since=<estate db_path mtime>` computation
(`codegraph-index.mjs:20-26`, which survives the codegraph delete — it is a git call, not a codegraph call)
to produce `staleness = { stale, commits_behind, indexed_at, source:"git-revlist", checked_at }`. The
`wicked.estate.drifted` event is a *fast-path hint* the daemon caches to avoid the git call when fresh — it is
never the sole source, so a never-emitted drift event can NOT silently yield `stale:false`. This preserves
the consumer's `staleness.stale` branch (`blast-radius.md:31` "*if `stale` is true after editing, re-run it*").

**The hash↔SymbolId memo `[BUILD-GATE]` (corrected — hashes were codegraph-minted, now brain mints them):**
`[PROVEN-IN-DESIGN]` v2-draft wrongly said `function:<hash>` ids are "brain-minted today." They are
**codegraph-minted**: `skills/wicked-brain-graph/SKILL.md:37-38` ("node ids follow **codegraph's** convention
… `function:<hash>`"), `:52-54` ("Backed by the `@colbymchenry/codegraph` CLI"). Since Step 1b deletes
codegraph, **brain must take over minting `function:<hash>`** — done by the Step-1a minter (DEC-C1a): brain
mints `function:<stable-hash(estate SymbolId + epoch)>` deterministically. The memo is then the
`(function_hash ↔ estate SymbolId, epoch)` table the minter produces, stored in the overlay. This is the
id-bridge that survives — NOT the codegraph graph. Because brain now controls the hash function, the consumer
contract is preserved only if the hash is **stable across re-index** for an unchanged symbol; AC-1.6 asserts
the minter exists and AC-1.4 asserts resolution.

> **Note — identity-epoch is a HARD ship-gate, not a soft dep (Lane X DEC-X6-SEQ, line 90; folds B-3).**
> estate's intern table is append-only; SymbolId reuse is possible until Lane A ships `symbols.gen` +
> `symbol_epoch`. The hash↔SymbolId memo MUST store the epoch alongside the SymbolId (xedge key already
> carries it, lines 77/86) so a delete+re-add of a file node doesn't resolve a stale `function:<hash>` to a
> live-wrong node. The Lane X v2 antagonist proved this is **live and silent** on the *first-shipping*
> about-arm until Lane A lands ("*stale-wrong-node bug live on the first-shipping about-arm until Lane A
> lands … DoD-X4 passes vacuously at epoch=0*", `design-gate-verdicts.md:86`). **Lane C's about-arm IS a
> first-shipping about-arm**, so this is a **BUILD-GATE ship-block (not a MED risk):** Lane A's
> `symbols.gen`+`symbol_epoch` MUST be green before Lane C's about-arm / `function:<hash>` memo ships
> reuse-safe. AC-1.4 + AC-3.1 carry reuse-safety negative cases (delete+re-add → stale hash must NOT resolve
> to the new node).

#### AC-1.4 — the direct `file:<path>` path (NEW, folds C-aB2)

> **AC-1.4 `[BUILD-GATE]` (direct-path resolution).** Index a fixture where `src/app.py` is a file node with
> known dependents. Call `graph-blast-radius --node "file:src/app.py"` (no prior `symbols` lookup — the
> direct path garden documents). **PASS =** the returned `dependents` set-equals the dependents of the
> resolved estate `SymbolId`, AND the envelope has top-level `node:"file:src/app.py"`, `staleness:{…}`, and
> each dependent has `{id, name, kind, file_path, start_line, end_line}`. **Negative case:** `--node
> "file:does/not/exist.py"` returns `resolve:"unresolved"` with an empty `dependents` and a `reason`, NOT a
> bare `dependents:[]` indistinguishable from a true zero.

---

### 1C. The off-disk `.codegraph` consumers (folds C-aB3 / C-C2 — uninventoried consumers)

**The fact (grounded — three consumers bypass `POST /api` entirely).** v1's "only garden consumes graph-*,
and only via the façade" is **false**. Three consumers read `.codegraph/codegraph.db` directly off disk; a
verb-façade over `POST /api` cannot shield them:

1. `[PROVEN-IN-DESIGN]` **`search:hotspots`** raw-SQLs the file: `hotspots.md:15-37` opens
   `.codegraph/codegraph.db` with `sqlite3.connect(...)` and runs
   `SELECT target, COUNT(*) … FROM edges WHERE kind != 'contains' … GROUP BY target ORDER BY refs DESC`,
   then `SELECT name, kind, file_path FROM nodes WHERE id=?`. It explicitly counts injected edges
   (`hotspots.md:37` "*injected edges (provenance LIKE 'injected:%') are included*").
2. `[PROVEN-IN-DESIGN]` **`wicked-patch`** reads it via `codegraph_db.py:42-103` (`build_patch_db`), which
   `sqlite3.connect(f"file:{codegraph_db}?mode=ro")` and translates `nodes`/`edges` into the patch
   `--db` schema. `codegraph_db.py:8-10`: "*Nothing produced that `--db` before, so the patch family was
   dead-on-arrival.*" garden's CLAUDE.md confirms: "*wicked-patch consumes the same `.codegraph/codegraph.db`
   brain builds.*"
3. **`search:service-map`** — does NOT read `.codegraph` (it uses `POST /api {action:search}` +
   Glob/Grep, `service-map.md:25-37`). **Correction to the prompt's framing:** service-map is shielded by
   the façade `search` verb (it never touches the DB). The two true off-disk readers are **hotspots** and
   **wicked-patch**. (Service-map is handled by §2/§4's preserved `search` verb; no special work.)

#### DEC-C3 — a DB-compat shim materializes `.codegraph/codegraph.db` from estate + injected edges; the codegraph file producer is deleted ONLY after the shim is green

The prompt's fork: *DB-compat shim materializing `.codegraph` from estate* **OR** *sequence their migration
(hotspots→estate RankHotspots) before the codegraph delete*. **DECISION: do BOTH, in this order** — the shim
is the bridge that keeps the deletion atomic-and-green; the native migration of hotspots is the follow-on
that lets the shim eventually retire.

**The shim (`graph-index` successor for off-disk readers):**
`[BUILD-GATE]` brain's `graph-index` action stops *building* a codegraph graph and instead **materializes a
read-compatible `.codegraph/codegraph.db`** from (estate nodes/edges) ⊕ (brain's injected-edge extractors,
§1A). The schema it writes is exactly what the two readers expect — proven by their own code:
`nodes(id,name,kind,file_path,start_line,end_line,signature)` + `edges(source,target,kind[,provenance])`
(`codegraph_db.py:75,85`; `hotspots.md:25,31`). The materialization:
- `nodes` ← estate entities (id = `file:<path>`/`function:<hash>` via §1B synthesis; signature from estate
  summary or null — `codegraph_db.py:77` already tolerates null signature).
- `edges` ← estate Calls/Imports/References (kind passthrough) **⊕** the injected edges (with
  `provenance LIKE 'injected:%'`, so `hotspots.md:37`'s provenance filter still works).
- Written to `.codegraph/codegraph.db` at the path the readers hardcode.

This is a **compatibility artifact**, not brain's store — it's a projection of estate + overlay onto a
legacy-shaped SQLite, regenerated on `graph-index` (idempotent, like `codegraph_db.py:44` "rebuilds from
scratch"). It means **wicked-patch keeps working unchanged** (it reads the same file the same way) and
**hotspots keeps working unchanged** in Phase 1.

**The sequence (retire-as-you-go, corrected from v1 §1.4):**

```
Step 1a  Build the injected-edge extractors' write-to-xedge path + the .codegraph shim
         (graph-index materializes the legacy DB from estate ⊕ injected). additive; nothing breaks.
Step 1b  RETIRE the codegraph static builder/walker/resolver (codegraph-client/index/resolver,
         WICKED_CODEGRAPH_BIN, the @colbymchenry/codegraph shell). graph-* verbs now serve from
         estate ⊕ injected (façade §1A). The .codegraph FILE still exists — now materialized by the
         shim — so hotspots + wicked-patch are UNTOUCHED. Delete codegraph-client/index/resolver in
         this commit; KEEP codegraph-extractors/. brain `node --test` green; AC-1.1/1.4 green.
Step 1c  (follow-on, NOT blocking the delete) migrate search:hotspots to a native ranking —
         estate RankHotspots (Lane A's `rank` over MCP, DEFINE §6 Lane A) — so hotspots no longer
         needs the shim. wicked-patch stays on the shim (its --db translation is legacy-shaped and
         out of this program's scope to rewrite).
Step 1d  The .codegraph shim is RETIRED only if/when wicked-patch is also migrated off it — explicitly
         OUT OF SCOPE for this program (DEFINE §3 "Out: net-new beyond the catalog"). Until then the
         shim is a permanent, cheap compat projection. The codegraph GRAPH is gone; the codegraph
         FILE-SHAPE lives on as a 1-table projection.
```

> **Net:** the prompt's "DB-compat shim **OR** sequence hotspots first" is resolved as **shim first
> (keeps the delete green), hotspots-native second (lets the shim shrink), wicked-patch stays on the shim
> (out of scope to rewrite).** The codegraph *delete* (Step 1b) is gated on the shim being green — AC-1.5.

#### AC-1.5 — shim parity for off-disk readers (NEW, folds C-aB3)

> **AC-1.5 `[BUILD-GATE]` (off-disk reader parity).** After Step 1b: (a) run `hotspots.md`'s exact SQL
> against the shim-materialized `.codegraph/codegraph.db` — the ranked list (incl. `injected:%` provenance
> rows; the SQL keys on `kind != 'contains'` AND surfaces `provenance LIKE 'injected:%'`, `hotspots.md:25-37`)
> is non-empty and matches the estate ⊕ injected edge counts; (b) run `codegraph_db.py build_patch_db`
> against the shim DB — it produces a patch `--db` with `symbols`/`refs`/`symbol_calls`/`symbol_imports`
> populated and `metadata.source='codegraph'`, no FileNotFoundError. **(c) (folds A-3) the materialized
> `nodes.signature` is null-or-a-real-signature, NEVER estate prose `summary`** — `codegraph_db.py:77` packs
> `signature` into the patch `symbols.metadata` as JSON that wicked-patch may read as a code signature;
> assert the shim writes `signature=NULL` when estate has no real signature (the reader tolerates null,
> `codegraph_db.py:77`). **PASS = both readers run unchanged AND no prose leaks into `signature`.** This gates
> the Step 1b codegraph delete.

---

### 1D. The compatibility façade + retire-as-you-go (revised ordering)

`[PROVEN-IN-DESIGN]` brain keeps `POST /api` + `wicked-brain-call` + skill *names*; handlers become MCP
clients + the merge/shim layer instead of SQLite. Degradation parity is preserved: an absent MCP →
`engine:"unavailable"` exactly as codegraph returns today (`codegraph-client.mjs:60` `#unavailable()`), so
consumers' existing branches (`blast-radius.md:45`) still fire.

**Revised deletion order (supersedes v1 D1.4):**

```
Step 0   Build the façade (MCP client pool) + the daemon scaffolding. additive.
Step 1   RETIRE codegraph (the heaviest single step — injected-edge fidelity + off-disk readers + the
         minting chicken-and-egg):
           1a  Build, BEFORE any delete: the brain-owned node/hash minter (estate → file:/function:<hash>)
               + the REWRITTEN extractors (resolve endpoints against estate-minted nodes; write to BOTH
               the xedge overlay and the §1C shim). Gated on AC-1.6 (fidelity with codegraph absent).
           1b  ONLY THEN delete the static builder/walker/resolver + WICKED_CODEGRAPH_BIN + the
               @colbymchenry/codegraph shell. KEEP the (rewritten) extractors. Gated on AC-1.1/1.4/1.5.
         (was v1's "lowest blast radius / 1:1 match" — falsified by C-aB1 + B-1 + B-2.)
Step 2   RETIRE LSP → estate SearchEntity/RetrieveEntity; delete lsp-*.mjs. (no external consumer; v1
         Explore confirmed.) Unchanged.
Step 3   RETIRE FTS5 store → memory + knowledge; delete sqlite-search.mjs + .brain.db + the file-watcher
         index path. GATED on Lane Y proving memory ≥ brain (DoD-5). Unchanged — still the
         not-owned-by-this-lane gate.
Step 4   Re-point the viewer (§4) at the façade; delete viewer's direct sqlite-search reads. Unchanged.
```

Each step: successor wired first → contract test green (§1.6) → old module deleted same commit → brain
`node --test` green. `[PROVEN-IN-DESIGN]` this is the only ordering that satisfies DoD-6 "deleted in the same
change" while every commit stays green.

### 1.5 Façade transport (folds the reviewer's "net-new MCP-client pool, underweighted")

`[PROVEN-IN-DESIGN]` brain has **no MCP client today** — it spawns LSP servers (`lsp-manager.mjs`) and shells
codegraph, but speaks no MCP. The façade's stdio-MCP **client pool** (spawn/hold estate·memory·knowledge,
mirroring `lsp-manager.mjs`'s process management) is **net-new code**, not a reshape. v2 weights it as a
first-class build item:
- **OQ1 resolution `[BUILD-GATE]`:** brain **detects host-registered MCPs first** (the port-probe pattern,
  `wicked-brain-server.mjs:58`), spawns its own only as fallback — avoids double-spawn when the host CLI
  already registered estate/memory (`wicked-estate/README.md:133`). Same shape as the existing brain-port
  detection.
- **Graceful degradation:** a dead MCP client → `engine:"unavailable"` (parity with codegraph). The pool
  retries with backoff; a permanently-absent MCP degrades the dependent verb, never crashes the server.

### 1.6 Falsifiable acceptance (backend swap) — revised set

| AC | What it proves | Tag |
|---|---|---|
| **AC-1.1** (rewritten, §1A) | injected-edge **fidelity**, PROVENANCE-keyed (not key-parity, not kind-keyed) on a 4-edge fixture | `[BUILD-GATE]` |
| **AC-1.2** (unchanged) | estate absent → `graph-blast-radius` returns `engine:"unavailable"`; garden's `blast-radius.md:45` branch fires | `[BUILD-GATE]` |
| **AC-1.3** (revised) | after Step 1b, `git ls-files` shows `codegraph-client/index/resolver.mjs` deleted, `codegraph-extractors/` **retained (rewritten)**; after Step 2 `lsp-*.mjs` deleted; after Step 3 `sqlite-search.mjs` deleted; brain `node --test` green; no import of a deleted module remains | `[BUILD-GATE]` |
| **AC-1.4** (NEW, §1B) | direct `file:<path>` resolution + loud-on-unresolved + reuse-safety negative | `[BUILD-GATE]` |
| **AC-1.5** (NEW, §1C) | hotspots SQL + `codegraph_db.py` run unchanged against the materialized `.codegraph`; no prose in `signature` | `[BUILD-GATE]` |
| **AC-1.6** (NEW, §1A DEC-C1a) | brain-owned minter + rewritten extractors → injected-edge fidelity holds with `@colbymchenry/codegraph` ABSENT; **gates the Step 1b delete** (resolves the chicken-and-egg) | `[BUILD-GATE]` |

---

## 2. Combined-power skills (revised — consume estate + memory + **xedge**; OWN the dedup)

`[PROVEN-IN-DESIGN]` These four `skill://` resources (change-impact, rationale-archaeology,
contradiction-hunting, unified-affordance) are tool-free (D1.2 — brain adds zero MCP tools) and follow the
`skill://codebase-expedition` pattern memory already ships (`wicked-memory-mcp/src/lib.rs:23`). The method
outlines from v1 §2.2 stand. v2 changes **two** things the gate flagged:

### 2.1 Cross-source reads go through xedge (folds DEC-1 + Lane X)

v1 had change-impact call "knowledge `knowledge-recall` filtered to `governs`/`depends-on`" and memory recall
separately, then fuse. Under DEC-1 (separate stores), **the cross-domain links (code↔knowledge↔memory) live
in the xedge overlay**, not in any single engine. So:
- `[PROVEN-IN-DESIGN]` **change-impact(symbol):** estate `BlastRadius` ⊕ injected (§1A) for the code blast
  radius; then `xedge.traverse(seed=symbol, cross_edge_kinds=["governs","about"])` to reach the governing
  rules (knowledge) and the decisions (memory) **linked to that symbol** — this is the Lane X read-union
  (`design-gate-verdicts.md:68` neighbors-override; line 84 code-tools opt-IN to cross_edge_kinds). Fuse +
  cite, honoring C4 (provenance/staleness visible).
- `[PROVEN-IN-DESIGN]` **recall's `about` arm is ON by default** (Lane X antagonist #2 fix, line 84:
  `recall()` defaults `["about"]`), so a code-seeded `memory.recall` surfaces `about`-linked decisions without
  the skill having to opt in — the skill opts in to the *additional* `governs`/`supersedes` kinds.
- **rationale-archaeology / contradiction-hunting:** same pattern — the `supersedes`/`refines`/`contradicts`
  chains are xedge traversals (`cross_edge_kinds=["supersedes","refines","contradicts"]`), grounded back to
  code via estate `RetrieveEntity`.

> **Gated reality `[BUILD-GATE]`:** the `governs`/`mentions` xedge arms ship *after* the knowledge id
> contract (Lane X C-X-5 / OQ-X3, line 72 — "only the `about` arm ships first"). So on day one,
> change-impact returns code blast radius + `about`-linked decisions; `governs` rules join when knowledge's
> id contract lands. This is **graceful degradation, stated in each SKILL.md** (v1 R7) — not a failure.

### 2.2 The re-link reaction is trigger→re-query, with COARSE payloads (folds event-catalog-contract)

`[PROVEN-IN-DESIGN]` the pinned events carry **counts and ids, never per-symbol arrays or content**
(event-catalog-contract.md:9-10: "*Consumers TRIGGER on an event, then RE-QUERY the engine for detail*").
So any skill or reaction driven by `wicked.estate.indexed` / `wicked.knowledge.ingested` must, on the event,
**re-query** estate/knowledge for the new/changed symbols — it cannot read them from the payload. (Folded
into §3.)

### 2.3 OWN the cross-source dedup equivalence function (folds C3-punt — do NOT defer to "Lane B C3")

v1 §2.5 OQ5 punted the citation/equivalence shape to "Lane B's C3 contract; brain conforms." The antagonist
(verdicts line 41) overturned this: **C3 defines no equivalence function** — it's net-new logic brain must
own, because the dedup is across **three id-spaces** (estate `SymbolId`, memory `uuid_v7`, knowledge
`concept_id`/source digest) that no single engine reconciles.

#### DEC-C4 — brain owns `equiv()`; its NON-circular carrier is a brain-owned cross-engine text hash (folds antagonist B-4)

`[PROVEN-IN-DESIGN]` brain does union-find canonical collapse **within its own single store** (`.brain.db`):
`ARCHITECTURE.md:194-209` collapses rows on `content_hash`/`canonical_for`/`translation_of`/`version_of`
frontmatter, surfaced as `also_found_in` (`ARCHITECTURE.md:207`); the content-hash dedup is
`db.findByContentHash(...)` (`memory-subscriber.mjs:72`). **The antagonist is right that this is single-store
and does NOT generalize across three Rust engines** — knowledge chunks and memory facts from separate engines
will not carry brain's frontmatter fields, and `findByContentHash` is a brain-local FTS5 lookup. So
cross-source dedup is **net-new logic brain must own** (not "brain already does it"). v2 specifies it as:

```
equiv(item_a, item_b) → bool   # are these the same fact/symbol surfaced from two sources?
  TRUE iff ANY:
    1. same code anchor       — both cite the same estate SymbolId (after §1B normalization + epoch).
                                (fires only for the code↔code case.)
    2. brain-owned text hash  — normHash(item) equal, where normHash is a BRAIN-OWNED canonicalizer
                                (lowercase, collapse-whitespace, strip-markup, shingle) computed over each
                                source's text at recall time — NOT memory's local findByContentHash, NOT
                                any single engine's hash. This is the PRIMARY cross-source carrier and works
                                on a fresh/empty-overlay brain (no prior edges needed).
    3. xedge identity (BONUS) — both resolve to the same (engine, stable-id) via an existing xedge
                                `about`/`same_as` edge. This arm STRENGTHENS dedup once the overlay is
                                populated but is NOT relied on — it is circular on a fresh brain (the about
                                edges are written by the daemon reaction, §3B), so equiv() must NOT depend
                                on it. Arm 2 carries the fresh-brain case alone.
  → collapse to one result; merge also_found_in:[{source, id, provenance, confidence}];
    keep the highest-confidence representative; surface the collapse (C1 collapse-but-surface).
```

**The circularity the antagonist found is closed by ordering the arms:** arm 3 (xedge identity) is explicitly
a bonus that may be empty; arm 2 (brain-owned text hash) is the carrier that works with zero overlay edges.
`equiv()` is brain-owned, net-new, and grounded in the *existence* of brain's collapse discipline
(`ARCHITECTURE.md:194-209`) — but the cross-engine canonicalizer (arm 2) is a `[BUILD-GATE]` build item, not
a re-use of `findByContentHash`.

#### AC-2.2 — REWRITTEN to prove on a FRESH/empty-overlay brain (binds the non-circular carrier)

> **AC-2.2 `[BUILD-GATE]` (cross-source collapse on an empty overlay).** On a **fresh brain with zero xedge
> `about`/`same_as` edges** (so arm 3 cannot fire), the same fact present as (a) a knowledge chunk, (b) a
> synthesized wiki node, (c) a memory fact — combined recall surfaces it **once** with
> `also_found_in:[{source:"knowledge",…},{source:"memory",…}]`, collapsed by **arm 2 (the brain-owned text
> hash), NOT by a pre-existing overlay edge**. **PASS =** one result, three sources listed, highest-confidence
> representative chosen, on an empty overlay. Plus the negative: two genuinely different facts that share
> keywords are NOT collapsed. (This is designed to fail if equiv() leans on the circular xedge-identity arm.)

AC-2.1 (change-impact returns dependents + governing rule + decision) and AC-2.3 (knowledge absent →
estate-only, no error) carry from v1 unchanged, both `[BUILD-GATE]`.

---

## 3. Bus-drain reactive layer (revised — pinned names, DEC-R split, trigger→re-query)

`[PROVEN-IN-DESIGN]` brain ALREADY drains the bus with a production-grade durable-cursor subscriber:
`memory-subscriber.mjs:59-100` (durable cursor, `pollIntervalMs:5000`), content-hash dedup
(`memory-subscriber.mjs:71-77`), TTL self-heal (`fastForwardStaleCursor`, `:125-160`), DLQ +
`onDeadLetter`→`wicked.memory.dead_lettered` (`:92-99`), graceful-degrade (`bus.mjs:54`). The reactive layer
**generalizes this one subscriber into N**, reusing all of it. This is the strongest "build on what exists"
in the lane and is unchanged in shape from v1.

### 3A. Filters use the PINNED `wicked.*` names (folds C-aB4 — v1's filters were regex-illegal)

`[PROVEN-IN-DESIGN]` v1 subscribed to `estate.indexed` and `recall.missed` — both **regex-illegal** (no
`wicked.` prefix; bus regex `^wicked\.[a-z0-9_]+…`, event-catalog-contract.md:8) **and** not what A/B emit.
v2 binds every filter to the co-signed contract:

| Pinned event (event-catalog-contract.md) | Reaction | DEC-R class |
|---|---|---|
| `wicked.estate.indexed` `{root, counts, commit, db_path, ts}` (:17) | **re-link** — TRIGGER, then re-query estate for new/changed symbols, write `about`/`mentions` xedge edges | **deterministic → daemon runs it** |
| `wicked.knowledge.ingested` `{source_ref, counts, ts}` (:22) | **re-link** — same trigger→re-query pattern | deterministic → daemon |
| `wicked.recall.missed` `{domain, query_hash, scope, ts}` (:25) | **gap-hunt** — convert miss into an ingest/discovery **task** (dedup'd); reuses brain's `enhance` skill | task-emit (the agent ingests) |
| `wicked.knowledge.contradiction_found` `{scope, ts}` (:24) | **surface** for human review (collapse-but-surface, C1); the contradiction-hunting skill (§2.3) as a daemon entry | deterministic surface → daemon |
| `wicked.estate.drifted` `{db_path, commits_behind, ts}` (:18) | **staleness surface** — feeds the façade's `staleness` synthesis (§1B) | deterministic → daemon |
| typed `governs` linking; C5 vocabulary **curate** | (no single event — driven off `indexed`/`ingested` churn) | **LLM-judgment → emitted TASK, never the daemon** |

`[PROVEN-IN-DESIGN]` re-link is **trigger→re-query** because the payload is coarse — counts, not symbols
(event-catalog-contract.md:9-10,17). On `wicked.estate.indexed` the daemon re-queries estate for the changed
set, then writes the deterministic edges. This is the exact redesign the contract mandates for Lane C
(event-catalog-contract.md:39).

### 3B. The re-link reaction writes to xedge, idempotently (folds DEC-1)

`[PROVEN-IN-DESIGN]` re-link edges are cross-domain (code↔knowledge) → they go to the **xedge overlay**
(DEC-1), keyed `(engine, stable-id)`, not into estate/knowledge native edge spaces (which would re-introduce
the B-ADV-1 `governs` collision DEC-1 dissolved). The reaction is idempotent (check-edge-exists before
write), honoring at-least-once delivery (v1 D3.4) — and bounded against reaction storms by the existing 5 s
poll batch + per-cycle caps (v1 R9). `[BUILD-GATE]` the write goes through xedge's single writer (Lane X);
the daemon competing with an agent for the overlay writer is serialized by xedge's actor, not WAL contention
(v1 R10 is dissolved by DEC-1 — separate stores, one overlay writer).

### 3C. OQ6 RESOLVED by DEC-R — the integrated-scenario contract (folds OQ6)

> **DEC-R (verdicts line 95) is the one rule:** *judgment is ALWAYS agent-via-skill/task; deterministic
> lifecycle is ALWAYS engine/daemon.* For Lane C this is the **integrated-scenario contract**, stated plainly:
>
> - The reactive **daemon** does **DETERMINISTIC re-links only**: `about` / `mentions` edges (a symbol *is
>   mentioned in* a chunk; a chunk *is about* a symbol — resolvable by name/path/anchor match, no model).
>   The daemon carries **no LLM** (DEC-R: "the engine carries no LLM/judgment model"), so it cannot and does
>   not type `governs`/`supersedes`/`contradicts`.
> - **Typed `governs`/`supersedes` linking and C5 vocabulary curation are emitted as agent TASKS** — the
>   daemon writes a task (the same task-emit shape gap-hunt uses); the next agent session, running the
>   relation-typing **skill** (the agent IS the reasoner, DEC-R), reads the task and writes the typed edge.
> - This is **already the pinned contract** (event-catalog-contract.md:30-32: "*LLM-judgment reactions (typed
>   `governs` linking, curate) are NOT run in the daemon — they are emitted as tasks an agent session drains;
>   only deterministic `about`/`mentions` re-links auto-complete*").
>
> **Consequence for DoD-4 (the integrated green, DEFINE §6):** the end-to-end scenario's "*an event drains to
> brain and triggers a reaction*" is satisfied by the **deterministic `about` re-link** — that auto-completes
> in the daemon within one poll cycle and is the thing AC-3.1 verifies. The *typed* `governs` link is NOT
> required for integrated-green; it is an emitted task whose completion is a separate, agent-driven step. This
> de-risks DoD-4: it no longer waits on an LLM-in-daemon that DEC-R forbids.

### 3D. The `wicked.fact.extracted` contradiction (folds C-aB5 — two lanes, one event)

**The fact (grounded both sides).**
- `[PROVEN-IN-DESIGN]` **Brain side:** `memory-subscriber.mjs:20` `FACT_FILTER = "wicked.fact.extracted"`;
  the subscriber promotes the fact → a memory file (`memory-subscriber.mjs:67-88` via `memory-promoter.mjs`).
  v1 AC-3.3 guards this as a KEEP/regression path.
- `[PROVEN-IN-DESIGN]` **Garden side:** `gate4-cutover-matrix.md` FLAG 2 (lines 17-26, 42) — garden's
  `hooks/scripts/stop.py::_run_memory_promotion` is the **producer** of `wicked.fact.extracted` (via
  `FactExtractor` over the smaht session log). Gate4 is **deleting smaht/v2**, and offers two options:
  "*1. Reimplement a stdlib extractor over `${CLAUDE_CONFIG_DIR}/tasks/{session_id}/*.jsonl`. 2. Accept that
  per-session auto-memorize dies; explicit `wicked-brain:memory` calls remain.*" gate4's verdict is **GO**
  with this as an acceptable PARTIAL.

So two lanes hold contradictory plans for one event: brain *depends on* the feed; garden *may delete its
producer*.

#### DEC-C5 — brain's auto-consolidate KEEP path DEPENDS on garden retaining the producer; if garden retires it, auto-consolidate is OUT-OF-SCOPE and explicit `wicked-brain:memory` remains

The prompt's fork: *declare out-of-scope, replace the source, or depend on garden retaining it.*
**DECISION: depend on garden retaining it, with a declared fallback to out-of-scope.** Reasoning:
1. **Brain must not own garden's session-fact extraction.** Re-implementing `FactExtractor` over garden's
   native task transcript (`gate4` option 1) is **garden's** stdlib work (gate4 scopes it to garden's Phase 2
   PR, line 21), and it reads garden-internal session logs brain has no business parsing. That is squarely
   DEFINE §3 "Out: net-new beyond the catalog" for Lane C.
2. **The event is in the pinned catalog's spirit but the *producer* is garden's.** brain's contract is: *if
   `wicked.fact.extracted` is emitted, brain consolidates it* (the KEEP path, deterministic, DEC-R-compliant
   — it's a promote, not a judgment). brain does not require it to be emitted.
3. **Therefore:** brain's reactive layer **subscribes** to `wicked.fact.extracted` and keeps the promote path
   (no regression for any other producer that emits it). But brain's DoD does **not** assert that per-session
   auto-memorize *works end-to-end*, because that requires a producer brain doesn't own. If garden picks
   gate4 option 2 (retire the producer), per-session auto-memorize "dies" exactly as gate4 says — and the
   user's CLAUDE.md already mandates **explicit `wicked-brain:memory` (store mode)** for decisions/patterns/
   gotchas (garden CLAUDE.md "Memory Management" override), so the capture path survives by a different,
   intentional mechanism.

#### AC-3.3 — REWRITTEN to reconcile with gate4 (folds C-aB5)

> **AC-3.3 `[BUILD-GATE]` (fact-extracted promote, source-agnostic).** Emit a **synthetic**
> `wicked.fact.extracted` event (NOT relying on garden's producer). The daemon promotes it to a memory
> capture exactly as `memory-subscriber.mjs:67-88` does today (regression guard on the KEEP path, dedup'd on
> redelivery). **PASS =** one memory capture per unique fact, idempotent. **Explicitly NOT asserted:** that
> garden's `stop.py` emits the event end-to-end — that producer is garden-owned and may be retired per
> `gate4-cutover-matrix.md` FLAG 2; brain's auto-consolidate is **conditional on garden retaining a
> producer**, and the user-facing capture path is otherwise served by explicit `wicked-brain:memory`.

#### Cross-lane action item (for the integrated gate)

> **CL-1 `[BUILD-GATE]`:** Lane C and wicked-garden must co-sign whether `wicked.fact.extracted` keeps a
> producer. If garden retires it (gate4 option 2), brain removes the auto-consolidate reaction from its
> DoD-4 integrated scenario (it cannot be the event that "drains and triggers a reaction" — use
> `wicked.estate.indexed`→re-link, §3C, which IS owned by Lane A). If garden retains it (gate4 option 1),
> AC-3.3's end-to-end form is added. **This must be resolved before the integrated gate, not at build time.**

### 3.4 Falsifiable acceptance (reactive layer) — revised set

| AC | What it proves | Tag |
|---|---|---|
| **AC-3.1** (revised, §3A/3C) | synthetic `wicked.estate.indexed` (pinned name) → within ≤5 s the daemon **re-queries** estate and writes a deterministic `about` xedge edge, verifiable by `xedge.traverse`/`memory.recall` seeded on the symbol. The DoD-4 linchpin. **+ reuse-safety negative (folds B-3):** delete+re-add the seed symbol (epoch bump) → the prior `about` edge / `function:<hash>` memo MUST NOT resolve to the new node; with epoch=0 (Lane A not landed) this case is EXPECTED TO FAIL, which is why the about-arm is ship-gated on Lane A (R7). | `[BUILD-GATE]` |
| **AC-3.2** (revised) | force a thin recall → `wicked.recall.missed` (pinned name) → daemon emits a gap-hunt **task** (dedup'd on redelivery) | `[BUILD-GATE]` |
| **AC-3.3** (rewritten, §3D) | source-agnostic fact-extracted promote, idempotent; auto-consolidate-end-to-end explicitly conditional on garden | `[BUILD-GATE]` |
| **AC-3.4** (NEW, §3C) | typed `governs` link does NOT auto-complete in the daemon — it appears as an **emitted task**; verify no `governs` edge is written by the daemon alone (DEC-R enforcement) | `[BUILD-GATE]` |

---

## 4. Viewer over live activity (largely unchanged — rides the preserved façade)

`[PROVEN-IN-DESIGN]` the viewer (`viewer-page.mjs`, `renderViewerHtml()` @12) is "dynamic via fetch at
runtime" against `POST /api` (`viewer-page.mjs:8-9`). Because the façade (§1D) preserves `POST /api` by
name+shape, the viewer's Search/Wiki fetches keep working — minimal re-label, not re-architect (v1 D4.1).
v2 carries v1 §4 intact with one correction:

- **D4.2 Activity panel** reads the live event stream the daemon drains, via a new read-only `activity`
  action (mirrors `dlq_list`, `wicked-brain-server.mjs:290`), bounded/paged (`bus.mjs:109-119` `limit`
  pattern, v1 R11). The events shown are the **pinned `wicked.*` names** (§3A), so the Activity feed labels
  match what A/B/knowledge actually emit (the v1 viewer would have shown nothing, since its daemon subscribed
  to illegal names — this is a downstream beneficiary of the C-aB4 fix).
- **D4.3** read-only + localhost-only, unchanged (`README.md:124`, `wicked-brain-server.mjs:360`).

AC-4.1 (trigger a re-link → Activity shows it within one refresh) and AC-4.2 (Search fused results render
with source chips) carry from v1, both `[BUILD-GATE]`.

---

## 5. DECISIONS (the v2 spine)

| # | Decision | Folds | Tag |
|---|---|---|---|
| **DEC-C1** | KEEP brain's injected-edge extractors as a façade **merge** layer over estate (do NOT have Lane A absorb them); they write to xedge; AC-1.1 asserts injected-edge **fidelity** | C-aB1 | design |
| **DEC-C2** | Brain-owned, deterministic, **bidirectional** id+field resolver in the façade: `file:<path>`/`function:<hash>` ↔ estate `SymbolId`; synthesize top-level `node` + `staleness` (from `wicked.estate.drifted`); loud-on-unresolved | C-C1, C-aB2 | design |
| **DEC-C3** | A **DB-compat shim** materializes `.codegraph/codegraph.db` from estate ⊕ injected edges; hotspots→estate `rank` (native) as follow-on; wicked-patch stays on the shim (out of scope to rewrite); codegraph **delete gated on shim parity** (AC-1.5). service-map is shielded by the `search` verb (it never reads the DB) — prompt framing corrected | C-aB3, C-C2 | design |
| **DEC-C4** | Brain **OWNS** the cross-source dedup `equiv()` (xedge identity ∪ code-anchor ∪ content-hash); do NOT punt to "Lane B C3" | antagonist C3-punt | design |
| **DEC-C5** | Brain's auto-consolidate KEEP path **depends on garden retaining** the `wicked.fact.extracted` producer; if garden retires it (gate4 opt 2), auto-consolidate is **out-of-scope** and explicit `wicked-brain:memory` remains; CL-1 co-sign required before integrated gate | C-aB5 | design |
| **DEC-R applied** | Daemon = **deterministic re-links only** (`about`/`mentions`); typed `governs`/curate = **emitted agent tasks**; no LLM in the daemon. The integrated-scenario contract (§3C). DoD-4 linchpin = the deterministic `about` re-link | OQ6, C-C3 | foundation-applied |
| **DEC-events** | All daemon filters use the **pinned `wicked.*` names**; re-link is **trigger→re-query** (coarse payloads) | C-aB4 | foundation-applied |
| **DEC-xedge** | Cross-source skill reads + re-link writes go through the **xedge overlay** (DEC-1, verdicts :97; Lane X resolved at :81, PASS at :92); the injected-edge merge selects by **provenance** (`injected:%`), not `cross_edge_kinds` (edges are `kind="references"`); `recall`'s `about` arm is ON by default (:84); `governs`/`mentions` arms gated on the knowledge id contract (about-arm first) | DEC-1, Lane X, B-1 | foundation-applied |

Unchanged from v1 and surviving the gate: brain = skill-pack + reactive daemon + viewer, ADDS skills, ADDS
zero MCP tools (D1.1/D1.2); four tool-free combined skills (D2.1); the viewer rides the façade (D4.x);
retire-as-you-go, delete-in-same-commit (D1.4, reordered in §1D).

---

## 6. RISKS (revised, with the build-gate that falsifies each)

| # | Risk | Sev | Falsified by | Sequenced dep |
|---|---|---|---|---|
| **R1** | **Injected-edge fidelity loss** — the merge layer drops an injected kind, or xedge's `cross_edge_kinds` opt-in is misconfigured → silent under-report (the C-aB1 regression, one layer down) | **HIGH** | AC-1.1 (fidelity, designed to fail on naive swap) | needs the extractors→xedge write path (Step 1a) |
| **R2** | **Direct `file:<path>` silently empties** — resolver returns bare `[]` on an unresolved path, consumer reads it as "no dependents" | **HIGH** | AC-1.4 (loud-on-unresolved negative case) | — |
| **R3** | **Off-disk reader breakage** — Step 1b deletes the codegraph file producer before the shim is green → hotspots + wicked-patch dead-on-arrival | **HIGH** | AC-1.5 (gates the delete) | shim (Step 1a) must precede delete (Step 1b) |
| **R4** | **FTS5 deletion gated on a thing this lane doesn't own** — Step 3 can't land until Lane Y proves memory ≥ brain (DoD-5). If Lane Y slips, brain can't complete cutover | **HIGH** | Lane Y harness (not Lane C) | Lane Y green before Step 3 |
| **R5** | **`wicked.fact.extracted` cross-lane contradiction unresolved** — brain ships an auto-consolidate DoD-4 dependency on a producer garden deletes | **MED** | CL-1 co-sign (before integrated gate) | garden gate4 Phase 2 decision |
| **R6** | **`governs` arm ships inert** — knowledge id contract (Lane X OQ-X3) not landed → change-impact has no rules, only code+`about` decisions | **MED** | stated degradation in SKILL.md; `about` arm ships first (Lane X line 72) | knowledge id contract |
| **R7** | **identity-epoch not landed → first-shipping about-arm carries the stale-wrong-node bug LIVE + AC-3.1 passes vacuously at epoch 0** (verdicts :86) | **HIGH (ship-block)** | AC-1.4 + AC-3.1 reuse-safety negative cases | **HARD GATE:** Lane A `symbols.gen`+`symbol_epoch` green BEFORE Lane C's about-arm/memo ships (DEC-X6-SEQ, line 90) — not a soft dep |
| **R8** | **MCP-client pool is net-new** — double-spawn or pool starvation under the daemon + agent load | **MED** | OQ1 host-detect-first (§1.5); pool backoff | — |
| **R9** | **`equiv()` over-collapses** — two different facts sharing keywords merged | **MED** | AC-2.2 negative case | — |

---

## 7. Definition of Done — PROVEN-IN-DESIGN vs BUILD-GATE

> **The honesty rule:** the left column is what the design *establishes as true now* (verified against real
> code). The right column is what must be *built and proven by a named test/bench* before it can be trusted.
> Nothing in the left column is a behavioral claim about the re-cast system; those are all on the right.

| Area | `[PROVEN-IN-DESIGN]` (verified now, file:line) | `[BUILD-GATE]` (named proof required) |
|---|---|---|
| **Injected edges (§1A)** | estate `BlastRadius` is Calls-reachability only and produces none of `injected:bus/dispatch/capability/archetype` (`blast-radius.md:42,58`). The 4 extractors exist and store edges as `kind="references"` with the discriminator in **`provenance`** (`bus.mjs:30,172-175`; `dispatch.mjs:21,111-115`; `capability.mjs:24`; archetype.mjs:61) — **but they currently write into a codegraph `nodes`/`edges` table the codegraph builder populates** (so "exist + run" is true only with codegraph present). KEEP-not-absorb is the correct layering (DEC-1 puts domain edges in the overlay). | **AC-1.6** minter + extractor-rewrite green with codegraph ABSENT (resolves the B-2 chicken-and-egg) → **AC-1.1** injected-edge fidelity, **provenance-keyed** (not `cross_edge_kinds`-keyed), set-equality vs pre-swap brain; designed to fail on a naive swap AND on a kind-keyed merge. The merge `equiv()` (DEC-C4) does not drop/dup. |
| **id+field translation (§1B)** | the two schemas differ; consumer wants top-level `node`+`staleness` (`codegraph-client.mjs:69`); estate has neither + no `file:path` resolver (verdicts C-aB2). `function:<hash>` is **codegraph-minted today** (`wicked-brain-graph/SKILL.md:37-38,52-54`), so brain must take over minting it (DEC-C1a). staleness is computed by `git rev-list` today (`codegraph-index.mjs:20-26`), not from the drift event. | **AC-1.4** direct `file:<path>` resolves + loud-on-unresolved + reuse-safety negative. The brain-minted hash↔SymbolId memo + epoch (R7 ship-gate) carry identity safely; staleness from on-demand `git rev-list`, drift-event as hint only (A-1). |
| **off-disk consumers (§1C)** | hotspots raw-SQLs `.codegraph` (`hotspots.md:15-37`); wicked-patch reads it (`codegraph_db.py:42-103`). service-map does NOT (uses `search` verb, `service-map.md:25-37`) — prompt framing corrected. | **AC-1.5** shim materializes a reader-compatible `.codegraph` (estate⊕injected); both readers run unchanged; gates the Step 1b delete. hotspots→native `rank` follow-on. |
| **retire-as-you-go (§1D)** | façade preserves `POST /api`+CLI verbs + `engine:"unavailable"` (`codegraph-client.mjs:60`); delete-in-same-commit is the only DoD-6-satisfying order. | **AC-1.3** deletion proof (codegraph static/LSP/FTS5 gone, extractors retained); brain `node --test` green; no dangling imports. |
| **combined skills (§2)** | tool-free `skill://` (D1.2); `skill://` pattern exists (`memory lib.rs:23`); brain's collapse discipline exists but is **SINGLE-STORE** (`ARCHITECTURE.md:194-209`, `also_found_in` @`:207`; memory-local `findByContentHash` @`memory-subscriber.mjs:72`) — it does NOT generalize across the 3 engines (antagonist B-4); recall `about`-arm ON by default (verdicts :84). | **AC-2.1** all three sources cited; **AC-2.2** `equiv()` collapses to one on a **fresh/empty-overlay brain** via the brain-owned cross-engine text hash (arm 2), NOT the circular xedge-identity arm (arm 3) + negative; **AC-2.3** knowledge-absent degrades. The cross-engine canonicalizer is net-new (not `findByContentHash`). `governs` arm gated on knowledge id contract (R6). |
| **reactive daemon (§3)** | durable cursor + TTL self-heal + DLQ + dedup + graceful-degrade all exist (`memory-subscriber.mjs:59-160`, `bus.mjs:54`). Generalize-1-to-N is a small delta. | **AC-3.1** pinned `wicked.estate.indexed`→trigger→re-query→deterministic `about` edge ≤5 s (DoD-4 linchpin); **AC-3.2** gap-hunt task; **AC-3.3** source-agnostic promote; **AC-3.4** daemon does NOT write `governs` (DEC-R). |
| **event contract (§3A)** | pinned names exist + are regex-legal + co-signed (event-catalog-contract.md); v1's `estate.indexed`/`recall.missed` were illegal. re-link = trigger→re-query (coarse payloads). | filters wired to the pinned names; **AC-3.1/3.2** use them verbatim. |
| **OQ6 / DEC-R (§3C)** | the split (deterministic daemon / agent-task judgment) IS the pinned contract (event-catalog:30-32) + DEC-R (line 95). No LLM in the daemon. | **AC-3.4** enforces it; DoD-4 linchpin is the deterministic arm (de-risked off any LLM-in-daemon). |
| **fact.extracted (§3D)** | brain subscribes (`memory-subscriber.mjs:20`) + promotes (`:67-88`); garden produces it via smaht (`gate4 FLAG 2`) and **may retire it** (gate4 GO, option 2). | **CL-1** co-sign before integrated gate; **AC-3.3** source-agnostic (does NOT assert garden end-to-end). |
| **viewer (§4)** | fetch-driven over `POST /api` (`viewer-page.mjs:8-9`); façade preserves the endpoint; `dlq_list` read-only pattern + `limit` exist. | **AC-4.1** Activity shows a reaction; **AC-4.2** fused Search renders with source chips. |
| **cross-lane seq (§6)** | DEC-1 + Lane X PASS (overlay, traverse_multi, default-OFF gate, epoch, bench) are the settled foundation (verdicts 66–92). | Step 3 gated on **Lane Y**; about-arm reuse-safety gated on **Lane A epoch** (DEC-X6-SEQ); `governs` arm gated on **knowledge id contract**. |

---

## 8. Evidence trail (load-bearing claims → file:line)
- **Injected edges:** `wicked-garden/commands/search/blast-radius.md:27,42,58`, `lineage.md:33`;
  brain `server/lib/codegraph-extractors/bus.mjs:5-19,32`, `dispatch.mjs:7-19,23,25`,
  `capability.mjs:5-19,25`; envelope `server/lib/codegraph-client.mjs:60,66-85`.
- **id+field shapes:** `codegraph-client.mjs:69`; `wicked-garden/scripts/engineering/patch/codegraph_db.py:12-19,75,85`;
  estate side per verdicts C-aB2 (`design-gate-verdicts.md:37`); staleness source `event-catalog-contract.md:18`.
- **Off-disk consumers:** `hotspots.md:15-37` (raw SQL), `codegraph_db.py:42-103,45-47` (RO open),
  garden `CLAUDE.md` "wicked-patch consumes the same `.codegraph/codegraph.db`"; service-map NON-reader
  `service-map.md:25-37`.
- **fact.extracted contradiction:** brain `memory-subscriber.mjs:20,67-88`, `memory-promoter.mjs`;
  garden `scripts/ci/gate4-cutover-matrix.md:17-26,42` (FLAG 2, GO with "auto-memorize dies" as option).
- **Pinned events:** `event-catalog-contract.md:8-10,17-25,30-32,39`.
- **Foundation:** `design-gate-verdicts.md:66-92` (Lane X PASS), `:95` (DEC-R), `:96` (DEC-0 hold-maximal),
  `:97` (DEC-1 separate stores + overlay).
- **Brain components (KEEP/reuse):** `ARCHITECTURE.md:5,194-209,206`; `wicked-brain-server.mjs:58,137-314,290,336-342,360,416-426`;
  `memory-subscriber.mjs:59-160`; `bus.mjs:54,109-119`; `viewer-page.mjs:8-9,12`; `lsp-manager.mjs` (MCP-pool precedent).
- **MCP surfaces:** estate `wicked-estate-mcp/src/lib.rs:244-252`, `context_bundle.rs:3`;
  memory `wicked-memory-mcp/src/lib.rs:23,93-124`; knowledge thin verbs (DEFINE §8).
- **Charter:** `knowledge-program-DEFINE.md` §2 DoD-4/5/6, §3, §6, §8; `knowledge-capability-agent-spec.md` C1–C5.
- **Re-gate corrections (this revision):** injected-edge storage `kind="references"`+provenance —
  `bus.mjs:30,172-175`, `dispatch.mjs:21,111-115`, `capability.mjs:24`, garden `.codegraph-extractors/archetype.mjs:61`;
  consumer keys on provenance `hotspots.md:25-37`. `function:<hash>` codegraph-minted —
  `skills/wicked-brain-graph/SKILL.md:37-38,52-54`; brain only mints `file:`/virtual nodes
  `codegraph-nodes.mjs:37,57`. Extractors anchor on codegraph `nodes` — `bus.mjs:148-160`,
  `codegraph-nodes.mjs:14-19`. Staleness computed by git today — `codegraph-index.mjs:20-26`. Single-store
  collapse — `ARCHITECTURE.md:194-209` (`also_found_in` @`:207`), `memory-subscriber.mjs:72`. Epoch-inert /
  vacuous-at-0 — `design-gate-verdicts.md:86`; Lane X resolution @`:81`, PASS @`:92`, build-carry @`:90`.

---

## 9. Re-gate ledger (reviewer + antagonist verdicts on v2, and how each was folded)

> Per DEFINE §5, every design gets an independent reviewer + antagonist with captured verdicts. This is that
> record for v2. Both ran against this doc + the real code. v2-as-revised folds all blockers.

**Reviewer (architecture-critic) — CONDITIONAL PASS.** "Folds every blocking condition with real decisions,
real ACs, and an honest PROVEN/BUILD-GATE split; load-bearing claims about brain's own code are accurate."
All seven required folds (C-aB1 keep-decision + fidelity AC; C-C1/C-aB2 specified bidirectional resolver +
direct-path AC + loud-on-unresolved; C-aB3/C-C2 shim + delete-gate + verified service-map correction;
C-aB5 clear stance + rewritten AC-3.3 + CL-1; OQ6/DEC-R split as integrated contract; brain-owned `equiv()`
not punted; honest tagging) graded **PASS on substance**. Blocking items were **citation precision** only
(Lane X pointers at problem-lines `:68/:74` vs resolution `:81/:92`; extractor constants off 1–2 lines;
`also_found_in` `:206`→`:207`) — **all corrected** in this revision (§0 foundation bullet, §1A "The fact"
block, §5 DEC-xedge row, §8). The reviewer independently **confirmed the service-map correction is right**
(`service-map.md:25-37` never opens `.codegraph`; the prompt's framing was wrong) and that the shim schema is
a superset satisfying both readers.

**Antagonist (silent-failure-hunter) — NO-GO, 4 BLOCKING (+4 advisories). All folded:**

| # | Blocking finding (grounded) | Fold |
|---|---|---|
| **B-1** | The §1A merge keyed on `cross_edge_kinds=["injected:bus",…]` — but injected edges are stored `kind="references"` with the discriminator in **`provenance`** (`bus.mjs:172-175`; consumer agrees `hotspots.md:37`). A kind-keyed traverse returns ∅ → re-creates the C-aB1 silent regression one layer down. | §1A merge rewritten to select by `provenance LIKE 'injected:%'`; AC-1.1 forbids the kind-keyed harness; §5 DEC-xedge row + §8 corrected. |
| **B-2** | Step 1b deletes the codegraph builder, which mints `function:<hash>` (`SKILL.md:37-38,52-54`) and populates the `nodes` table the extractors anchor on (`bus.mjs:148-160`, `codegraph-nodes.mjs:14-19`). "KEEP, re-pointed" was false — it's a rewrite + a new minter, both needed BEFORE the delete. Chicken-and-egg. | **DEC-C1a** added: Step 1a builds a brain-owned minter + rewrites the extractors (two sinks: overlay + shim), gated by **AC-1.6** (fidelity with codegraph absent) BEFORE Step 1b. §1B memo over-claim ("brain-minted today") corrected. |
| **B-3** | The about-arm is a *first-shipping* about-arm; until Lane A's epoch lands it carries the stale-wrong-node bug LIVE and AC-3.1 passes vacuously at epoch 0 (verdicts `:86`). v2-draft under-classified this as a MED risk. | Promoted to a **HARD ship-gate** (R7 = HIGH/ship-block); AC-3.1 + AC-1.4 carry reuse-safety negative cases (delete+re-add → stale hash must NOT resolve to new node). |
| **B-4** | `equiv()` arm 1 (xedge identity) is **circular** on a fresh brain (the `about` edges are written by the gated daemon reaction); arms 2/3 reduce to memory-local `findByContentHash` (`:72`), which is **single-store**, not cross-engine — so "brain already does this" over-claimed. | **DEC-C4** rewritten: arm 2 is a **brain-owned cross-engine normalized-text hash** (the non-circular carrier, works on an empty overlay); the xedge-identity arm is demoted to a bonus. AC-2.2 now proves collapse on a **fresh/empty-overlay brain**. The single-store claim is scoped honestly in §2.3 + §7. |
| **A-1** (adv) | `staleness` from a drift event that may never fire → silent `stale:false`. | §1B: staleness computed on-demand by `git rev-list` (`codegraph-index.mjs:20-26`, survives the delete); drift event is a hint only. |
| **A-3** (adv) | Shim `nodes.signature` sourced from estate prose `summary` → silent semantic drift in wicked-patch (`codegraph_db.py:77` reads it as a signature). | AC-1.5(c): assert `signature` is null-or-real, never prose. |
| **A-2** (adv) | CL-1 fallback (estate.indexed→re-link) lands on the about-arm B-3 blocks — not closable independently. | Acknowledged: R5 + R7 are coupled; the integrated gate must clear both together. |
| **A-4** (clean) | service-map is NOT an off-disk reader — the doc's correction to the prompt is right. | No change needed; both gaters confirmed. |

**Vectors the antagonist checked and found CLEAN:** shim schema satisfies both readers (superset, null-signature
tolerated); deterministic about-link is bounded (5 s batch + per-cycle caps + idempotent), a precision concern
not a silent failure; the honesty discipline largely holds (two scoped tag-tightenings folded into A-3/B-4).

**Status after fold:** the 4 blockers were **designed-in mechanics errors** (provenance-vs-kind; the minting
chicken-and-egg; the epoch ship-gate; the dedup carrier) — each now has a concrete fix + a falsifying AC, and
none touched the thesis. The reviewer's CONDITIONAL was citation-only and is cleared. **Recommended next step:
build the thinnest runnable slice gated on AC-1.6 → AC-1.1 (the injected-edge path with codegraph absent),
since that is where two of the four blockers (B-1, B-2) concentrate.**
