/**
 * Brain → estate consolidation, stage S1b: the IMPORT half.
 *
 * Drives an export bundle (see `estate-export.mjs`) into wicked-estate:
 *
 *   1. CONTENT   — memories → `memory.capture`, chunks/wiki → `knowledge.write`
 *                  over the `wicked-estate-mcp` stdio binary (JSON-RPC 2.0,
 *                  newline-delimited: initialize handshake, then tools/call).
 *                  Every returned estate id is appended to `id-map.jsonl`
 *                  (the idempotency ledger — estate mints a fresh uuid-v7 per
 *                  write, so dedup MUST live on this side).
 *   2. RELATIONS — brain `links` → `knowledge.relate` with the REAL per-link
 *                  `confidence` + `evidence_count` values sent EXPLICITLY
 *                  (estate defaults confidence to 0.8; brain's default is 0.5 —
 *                  relying on either default silently retunes every link).
 *                  Estate edges upsert on (source, target, kind), so this pass
 *                  is naturally re-runnable. Links whose endpoints didn't land
 *                  go to `unresolved-links.json` — a fail-loud manifest, never
 *                  a silent drop.
 *   3. TELEMETRY — `telemetry.json` re-written as `telemetry-resolved.json`
 *                  (brain doc ids remapped to landed estate ids where known,
 *                  raw ids preserved otherwise — zero loss), then fed to the
 *                  `wicked-estate import-telemetry <file> --db <knowledge.db>`
 *                  CLI. The CLI is plain-INSERT (duplicates on re-run), so a
 *                  completed telemetry pass is recorded in `import-state.json`
 *                  and skipped on re-runs.
 *   4. VERIFY    — counts reconciliation (brain expected vs estate landed vs
 *                  loudly-accounted) written to `verification-report.json`.
 *                  Any unaccounted row ⇒ `zero_loss: false` ⇒ the CLI exits
 *                  non-zero.
 *
 * Import contract pinned to wicked-estate PR #95
 * (`wicked-estate/docs/brain-consolidation-import-contract.md`).
 */

import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseFrontmatterBlock, extractFrontmatter } from "./frontmatter.mjs";

/** Provenance string stamped on every migrated relation. */
export const MIGRATION_PROVENANCE = "brain-migration";

/** Relation name used for untyped brain wikilinks (links.rel is NULL). */
export const DEFAULT_REL = "references";

/**
 * Brain memory `type` → estate `memory.capture` kind. Estate's kind parser
 * FAILS CLOSED on unknown kinds (working|episode|entity|fact|skill|archive),
 * so every brain type must map onto that vocabulary. The original type is
 * preserved verbatim inside the content's frontmatter — nothing is lost, this
 * only picks the estate-side shelf.
 */
export const KIND_BY_BRAIN_TYPE = {
  decision: "fact",
  pattern: "skill",
  gotcha: "fact",
  preference: "fact",
  discovery: "episode",
};
const DEFAULT_KIND = "episode";

/** Estate tiers (memory.capture fails closed on anything else). Brain's tier
 *  vocabulary (working|episodic|semantic) is a strict subset — pass through. */
const ESTATE_TIERS = new Set(["working", "episodic", "semantic", "procedural", "archival"]);
const DEFAULT_TIER = "episodic";

/** Abort content import after this many CONSECUTIVE failures (wiring, not data). */
const MAX_CONSECUTIVE_FAILURES = 20;

// ─────────────────────────────────────────────────────────────────────────────
// MCP stdio client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal JSON-RPC 2.0 client for the `wicked-estate-mcp` stdio binary:
 * newline-delimited requests on stdin, newline-delimited responses on stdout,
 * matched by `id`. Notifications produce no output and are fire-and-forget.
 */
export class McpClient {
  #child = null;
  #pending = new Map();
  #nextId = 1;
  #buf = "";
  #stderrTail = "";
  #exited = null;
  #timeoutMs;

  constructor({ bin, args = [], env = process.env, timeoutMs = 60_000 }) {
    this.bin = bin;
    this.args = args;
    this.env = env;
    this.#timeoutMs = timeoutMs;
  }

  start() {
    this.#child = spawn(this.bin, this.args, {
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child.stdout.setEncoding("utf-8");
    this.#child.stdout.on("data", (chunk) => this.#onData(chunk));
    this.#child.stderr.setEncoding("utf-8");
    this.#child.stderr.on("data", (chunk) => {
      this.#stderrTail = (this.#stderrTail + chunk).slice(-8192);
    });
    this.#child.on("error", (err) => this.#failAll(err));
    this.#child.on("exit", (code, signal) => {
      this.#exited = { code, signal };
      this.#failAll(
        new Error(
          `wicked-estate-mcp exited (code=${code} signal=${signal}) with ` +
            `${this.#pending.size} call(s) in flight. stderr tail:\n${this.#stderrTail}`,
        ),
      );
    });
  }

  #onData(chunk) {
    this.#buf += chunk;
    let idx;
    while ((idx = this.#buf.indexOf("\n")) >= 0) {
      const line = this.#buf.slice(0, idx).trim();
      this.#buf = this.#buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // not JSON — ignore (defensive; the server writes clean lines)
      }
      const pending = this.#pending.get(msg.id);
      if (pending) {
        this.#pending.delete(msg.id);
        clearTimeout(pending.timer);
        pending.resolve(msg);
      }
    }
  }

  #failAll(err) {
    for (const [, p] of this.#pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.#pending.clear();
  }

  /** Send a request and await its matched response. */
  rpc(method, params) {
    if (!this.#child || this.#exited) {
      return Promise.reject(new Error("MCP server is not running"));
    }
    const id = this.#nextId++;
    const line = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        rejectPromise(
          new Error(`MCP call '${method}' timed out after ${this.#timeoutMs}ms`),
        );
      }, this.#timeoutMs);
      this.#pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.#child.stdin.write(line, (err) => {
        if (err) {
          this.#pending.delete(id);
          clearTimeout(timer);
          rejectPromise(err);
        }
      });
    });
  }

  /** Fire-and-forget notification (no id ⇒ no response line). */
  notify(method, params) {
    if (!this.#child || this.#exited) return;
    this.#child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  /** MCP initialize handshake. */
  async initialize() {
    const resp = await this.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "wicked-brain-estate", version: "1" },
    });
    if (resp.error) {
      throw new Error(`initialize failed: ${resp.error.message}`);
    }
    this.notify("notifications/initialized", {});
    return resp.result;
  }

  /**
   * tools/call wrapper. Returns:
   *   { ok: true,  data }                    — parsed JSON payload from content[0].text
   *   { ok: false, message, fatal, toolError } — JSON-RPC error (fatal when the
   *     domain is unavailable, code -32601) or an isError:true tool result.
   */
  async toolCall(name, args) {
    const resp = await this.rpc("tools/call", { name, arguments: args });
    if (resp.error) {
      return {
        ok: false,
        fatal: resp.error.code === -32601,
        toolError: false,
        message: `${resp.error.code}: ${resp.error.message}`,
      };
    }
    const result = resp.result ?? {};
    const text = result?.content?.[0]?.text ?? "";
    if (result.isError) {
      return { ok: false, fatal: false, toolError: true, message: text };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { ok: true, data };
  }

  /** Close stdin and wait (bounded) for the child to exit. */
  async close() {
    if (!this.#child) return;
    try {
      this.#child.stdin.end();
    } catch {
      // already closed
    }
    if (this.#exited) return;
    await new Promise((resolvePromise) => {
      const t = setTimeout(() => {
        try {
          this.#child.kill();
        } catch {
          // already gone
        }
        resolvePromise();
      }, 2000);
      this.#child.once("exit", () => {
        clearTimeout(t);
        resolvePromise();
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundle IO
// ─────────────────────────────────────────────────────────────────────────────

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

/** Load the exported bundle (manifest + documents + links + telemetry). */
export function loadBundle(bundleDir) {
  const manifestPath = join(bundleDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`not an export bundle (missing manifest.json): ${bundleDir}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  return {
    manifest,
    documents: readJsonl(join(bundleDir, "documents.jsonl")),
    links: readJsonl(join(bundleDir, "links.jsonl")),
    telemetry: JSON.parse(readFileSync(join(bundleDir, "telemetry.json"), "utf-8")),
  };
}

/** The idempotency ledger: brain doc id → landed estate id (+ metadata). */
export function loadIdMap(bundleDir) {
  const records = readJsonl(join(bundleDir, "id-map.jsonl"));
  const map = new Map();
  for (const r of records) map.set(r.brain_doc_id, r);
  return map;
}

function appendIdMap(bundleDir, record) {
  appendFileSync(join(bundleDir, "id-map.jsonl"), JSON.stringify(record) + "\n", "utf-8");
}

function loadState(bundleDir) {
  const p = join(bundleDir, "import-state.json");
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf-8"));
}

function saveState(bundleDir, state) {
  writeFileSync(join(bundleDir, "import-state.json"), JSON.stringify(state, null, 2) + "\n", "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Content mapping
// ─────────────────────────────────────────────────────────────────────────────

function docFrontmatter(doc) {
  const block = doc.frontmatter ?? extractFrontmatter(doc.content ?? "").frontmatter;
  if (!block) return {};
  try {
    return parseFrontmatterBlock(block);
  } catch {
    return {};
  }
}

/**
 * Estate memory scope for one imported brain document.
 *
 * Estate's scope grammar (`Scope::parse`, wicked-estate-memory-core) is
 * slash-separated `kind:id` segments — `org:acme/unit:pay`. Segments WITHOUT
 * a colon are discarded by that parser, so the earlier `brain/<id>/<doc>`
 * shape (zero colons) silently landed every memory at root scope `""` and
 * made the documented erase prefix match nothing. The shape is therefore
 * `brain:<brain-id>/doc:<doc-id>`, with both ids percent-encoded because doc
 * ids are brain-relative paths containing `/` (the grammar's segment
 * separator; a raw slash would split the id into colonless segments).
 */
export function memoryScope(doc, brainId) {
  return `brain:${encodeURIComponent(brainId)}/doc:${encodeURIComponent(doc.id)}`;
}

/**
 * `memory.capture` arguments for a brain memory document. The FULL markdown
 * (frontmatter included) travels as `content` — the brain's original
 * type/tier/tags/importance survive verbatim even though estate's kind/tier
 * vocabulary differs. `scope` (see {@link memoryScope}) embeds the brain doc
 * id so (a) every imported memory is erasable in estate via
 * `memory.erase scope_prefix "brain:<brain-id>"` and (b) two identical
 * memories at different paths stay distinct (the MCP server caches tools/call
 * responses by exact arguments — identical args would silently collapse).
 */
export function memoryCaptureArgs(doc, brainId) {
  const fm = docFrontmatter(doc);
  const brainType = typeof fm.type === "string" ? fm.type : null;
  const brainTier = typeof fm.tier === "string" ? fm.tier : null;
  return {
    content: doc.content ?? "",
    kind: KIND_BY_BRAIN_TYPE[brainType] ?? DEFAULT_KIND,
    tier: ESTATE_TIERS.has(brainTier) ? brainTier : DEFAULT_TIER,
    scope: memoryScope(doc, brainId),
  };
}

/**
 * `knowledge.write` arguments for a brain chunk/wiki document.
 *  - chunks → class "chunk" (kchunk)
 *  - wiki   → class "concept" (kconcept): estate's knowledge recall only
 *    searches chunk/section/concept nodes — class "doc" (kdoc) would make
 *    every wiki article invisible to `knowledge.recall`, which IS signal loss.
 * `source` embeds the brain doc id: per-doc-unique arguments (see the cache
 * note on memoryCaptureArgs) and durable provenance back to the brain.
 */
export function knowledgeWriteArgs(doc, brainId) {
  return {
    content: doc.content ?? "",
    class: doc.source_type === "wiki" ? "concept" : "chunk",
    scope: `brain/${brainId}`,
    source: `wicked-brain://${brainId}/${doc.id}`,
  };
}

/**
 * Import all bundle documents not yet in the ledger. Appends to id-map.jsonl
 * after every successful capture/write (crash-safe: at most the in-flight doc
 * is retried, and the MCP server's args-keyed response cache makes even that
 * retry return the previously minted id instead of duplicating).
 */
export async function importContent({ bundle, client, bundleDir, idMap, log = () => {} }) {
  const brainId = bundle.manifest.brain_id;
  const failures = [];
  let landed = 0;
  let skipped = 0;
  let consecutive = 0;

  for (const doc of bundle.documents) {
    if (idMap.has(doc.id)) {
      skipped++;
      continue;
    }
    const isMemory = doc.source_type === "memory";
    const tool = isMemory ? "memory.capture" : "knowledge.write";
    const args = isMemory ? memoryCaptureArgs(doc, brainId) : knowledgeWriteArgs(doc, brainId);
    const res = await client.toolCall(tool, args);
    if (!res.ok) {
      if (res.fatal) {
        throw new Error(`${tool} unavailable (domain not wired?): ${res.message}`);
      }
      failures.push({ brain_doc_id: doc.id, path: doc.path, tool, error: res.message });
      if (++consecutive >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(
          `${consecutive} consecutive content failures — aborting (wiring problem, not data). ` +
            `Last: ${res.message}`,
        );
      }
      continue;
    }
    consecutive = 0;
    const estateId = isMemory ? res.data.memory_id : res.data.node_id;
    if (!estateId) {
      failures.push({
        brain_doc_id: doc.id,
        path: doc.path,
        tool,
        error: `no id in response: ${JSON.stringify(res.data)}`,
      });
      continue;
    }
    const record = {
      brain_doc_id: doc.id,
      brain_path: doc.path,
      source_type: doc.source_type,
      estate_id: estateId,
      tool,
    };
    appendIdMap(bundleDir, record);
    idMap.set(doc.id, record);
    landed++;
    if (landed % 500 === 0) log(`content: ${landed} landed…`);
  }

  if (failures.length) {
    writeFileSync(
      join(bundleDir, "content-failures.json"),
      JSON.stringify(failures, null, 2) + "\n",
      "utf-8",
    );
  }
  return { landed, skipped, failures };
}

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Group raw link rows into candidate edges. Estate keys edges on
 * (source, target, kind), so N brain rows with the same
 * (source_id, target_path, rel) can only ever land as ONE edge — collapse
 * them here, deliberately and visibly, instead of letting last-write-win:
 *   evidence_count = MAX across the group (the tuned row wins),
 *   confidence     = the confidence of that max-evidence row.
 * `row_count` keeps the group's raw-row weight for reconciliation.
 */
export function aggregateLinks(links) {
  const groups = new Map();
  for (const link of links) {
    const rel = link.rel ?? null;
    const key = JSON.stringify([link.source_id, link.target_path, rel]);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        source_id: link.source_id,
        target_path: link.target_path,
        target_brain: link.target_brain ?? null,
        rel,
        confidence: link.confidence,
        evidence_count: link.evidence_count,
        row_count: 1,
      });
    } else {
      existing.row_count++;
      if (link.evidence_count > existing.evidence_count) {
        existing.evidence_count = link.evidence_count;
        existing.confidence = link.confidence;
      }
    }
  }
  return [...groups.values()];
}

/**
 * Resolve aggregated link groups to estate node-id pairs via the id-map.
 * Unresolvable groups land in the fail-loud unresolved list with a reason:
 *   cross_brain_target      — link points at another brain (out of scope here)
 *   source_no_document /
 *   target_no_document      — endpoint path/id has no row in `documents`
 *                             (brain "broken links"; linkHealth counts these)
 *   memory_endpoint         — endpoint is a memory doc: it landed in estate's
 *                             MEMORY store, but knowledge.relate verifies both
 *                             endpoints in the KNOWLEDGE store — there is no
 *                             cross-store relate in the PR #95 contract (gap
 *                             flagged in the PR).
 *   source_not_landed /
 *   target_not_landed       — document exists but has no id-map entry
 *                             (content import failed for it).
 */
export function resolveLinks({ links, documents, idMap }) {
  const docsById = new Map(documents.map((d) => [d.id, d]));
  const docsByPath = new Map();
  for (const d of documents) if (!docsByPath.has(d.path)) docsByPath.set(d.path, d);

  const groups = aggregateLinks(links);
  const resolved = [];
  const unresolved = [];

  for (const g of groups) {
    const fail = (reason) => unresolved.push({ ...g, reason });

    if (g.target_brain) {
      fail("cross_brain_target");
      continue;
    }
    const sourceDoc = docsById.get(g.source_id) ?? docsByPath.get(g.source_id);
    if (!sourceDoc) {
      fail("source_no_document");
      continue;
    }
    const targetDoc = docsByPath.get(g.target_path) ?? docsById.get(g.target_path);
    if (!targetDoc) {
      fail("target_no_document");
      continue;
    }
    if (sourceDoc.source_type === "memory" || targetDoc.source_type === "memory") {
      fail("memory_endpoint");
      continue;
    }
    const srcMap = idMap.get(sourceDoc.id);
    if (!srcMap) {
      fail("source_not_landed");
      continue;
    }
    const tgtMap = idMap.get(targetDoc.id);
    if (!tgtMap) {
      fail("target_not_landed");
      continue;
    }
    resolved.push({
      src: srcMap.estate_id,
      tgt: tgtMap.estate_id,
      rel: g.rel ?? DEFAULT_REL,
      confidence: g.confidence,
      evidence_count: g.evidence_count,
      source_id: g.source_id,
      target_path: g.target_path,
      row_count: g.row_count,
    });
  }

  return { groups, resolved, unresolved };
}

/**
 * Drive resolved link groups through `knowledge.relate`. The confidence and
 * evidence_count arguments are ALWAYS sent explicitly — estate's default
 * (0.8) differs from brain's (0.5), so omission would retune every link.
 * Edge upsert on (source, target, kind) makes re-runs safe.
 */
export async function importRelations({ client, resolved, bundleDir, unresolved }) {
  const upserted = [];
  const failed = [];
  for (const r of resolved) {
    const res = await client.toolCall("knowledge.relate", {
      src: r.src,
      tgt: r.tgt,
      rel: r.rel,
      confidence: r.confidence,
      evidence_count: r.evidence_count,
      provenance: MIGRATION_PROVENANCE,
    });
    if (!res.ok) {
      if (res.fatal) {
        throw new Error(`knowledge.relate unavailable: ${res.message}`);
      }
      failed.push({ ...r, reason: `relate_failed: ${res.message}` });
      continue;
    }
    upserted.push({ ...r, edge_id: res.data.edge_id ?? null });
  }

  const allUnresolved = [...unresolved, ...failed];
  writeFileSync(
    join(bundleDir, "unresolved-links.json"),
    JSON.stringify(allUnresolved, null, 2) + "\n",
    "utf-8",
  );
  writeFileSync(
    join(bundleDir, "relations-result.json"),
    JSON.stringify({ upserted }, null, 2) + "\n",
    "utf-8",
  );
  return { upserted, unresolved: allUnresolved };
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remap telemetry `item_id`s (brain doc ids at export time) to landed estate
 * ids. Rows for docs that never landed (deleted docs still have access rows)
 * keep the raw brain id — the estate table stores opaque strings, so the row
 * is preserved rather than dropped; the unmapped count is surfaced in the
 * verification report.
 */
export function remapTelemetry(telemetry, idMap) {
  let remapped = 0;
  let unmapped = 0;
  const access_log = telemetry.access_log.map((row) => {
    const rec = idMap.get(row.item_id);
    if (rec) {
      remapped++;
      return { ...row, item_id: rec.estate_id };
    }
    unmapped++;
    return { ...row };
  });
  return {
    resolved: { access_log, search_misses: telemetry.search_misses },
    remapped,
    unmapped,
  };
}

/** Parse the import-telemetry CLI's summary line into counts. */
export function parseTelemetryOutput(stdout) {
  const m = /imported\s+(\d+)\s+access-log row\(s\),\s+(\d+)\s+search-miss\(es\)/.exec(stdout);
  if (!m) return null;
  return { access: parseInt(m[1], 10), misses: parseInt(m[2], 10) };
}

/** Run `wicked-estate import-telemetry <file> --db <knowledgeDb>`.
 *  `estateBinArgs` prefixes the subcommand (lets tests run a node script:
 *  bin=process.execPath, args=[script]). */
export function runTelemetryCli({ estateBin, estateBinArgs = [], file, knowledgeDb, env = process.env }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(estateBin, [...estateBinArgs, "import-telemetry", file, "--db", knowledgeDb], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let errOut = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (errOut += c));
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`import-telemetry exited ${code}: ${errOut || out}`));
        return;
      }
      const counts = parseTelemetryOutput(out);
      if (!counts) {
        rejectPromise(new Error(`could not parse import-telemetry output: ${out}`));
        return;
      }
      resolvePromise(counts);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The zero-loss proof: reconcile brain-side expected counts against what
 * landed in estate plus what is loudly accounted for. `unaccounted` MUST be
 * zero in every row; anything else means silent loss and the caller exits
 * non-zero.
 */
export function buildVerificationReport({
  manifest,
  idMap,
  relations,
  telemetryResult,
}) {
  const landedByType = { memory: 0, chunk: 0, wiki: 0 };
  for (const [, rec] of idMap) {
    landedByType[rec.source_type] = (landedByType[rec.source_type] ?? 0) + 1;
  }

  const c = manifest.counts;
  const contentRows = [
    ["memories", c.memories, landedByType.memory],
    ["chunks", c.chunks, landedByType.chunk],
    ["wiki", c.wiki, landedByType.wiki],
  ];
  const reconciliation = {};
  for (const [name, expected, landed] of contentRows) {
    reconciliation[name] = { expected, landed, unaccounted: expected - landed };
  }

  const groups = relations.groups.length;
  const duplicateRowsCollapsed = c.links - groups;
  const edgesUpserted = relations.upserted.length;
  const groupsUnresolved = relations.unresolved.length;
  reconciliation.links = {
    expected_rows: c.links,
    aggregated_edges: groups,
    duplicate_rows_collapsed: duplicateRowsCollapsed,
    edges_upserted: edgesUpserted,
    groups_unresolved: groupsUnresolved,
    unaccounted: groups - edgesUpserted - groupsUnresolved,
  };

  reconciliation.access_log = {
    expected: c.access_log,
    imported: telemetryResult.access,
    remapped_to_estate_ids: telemetryResult.remapped,
    kept_raw_brain_ids: telemetryResult.unmapped,
    unaccounted: c.access_log - telemetryResult.access,
  };
  reconciliation.search_misses = {
    expected: c.search_misses,
    imported: telemetryResult.misses,
    unaccounted: c.search_misses - telemetryResult.misses,
  };

  const zeroLoss = Object.values(reconciliation).every((row) => row.unaccounted === 0);
  return {
    verified_at: Date.now(),
    contract: manifest.contract,
    brain_id: manifest.brain_id,
    reconciliation,
    zero_loss: zeroLoss,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full import: content → relations → telemetry → verification.
 * Re-runnable end to end: the id-map ledger skips landed content, relate
 * upserts, and the state file guards the (plain-INSERT) telemetry CLI.
 *
 * Returns the verification report (also written to verification-report.json).
 */
export async function runImport({
  bundleDir,
  mcpBin,
  mcpArgs = [],
  estateBin,
  estateBinArgs = [],
  knowledgeDb,
  env = process.env,
  timeoutMs = 60_000,
  log = () => {},
}) {
  const bundle = loadBundle(bundleDir);
  const idMap = loadIdMap(bundleDir);
  const state = loadState(bundleDir);

  const client = new McpClient({ bin: mcpBin, args: mcpArgs, env, timeoutMs });
  client.start();
  let content;
  let relations;
  try {
    await client.initialize();
    log(`connected to ${mcpBin}`);

    content = await importContent({ bundle, client, bundleDir, idMap, log });
    log(
      `content: ${content.landed} landed, ${content.skipped} already mapped, ` +
        `${content.failures.length} failed`,
    );

    const { groups, resolved, unresolved } = resolveLinks({
      links: bundle.links,
      documents: bundle.documents,
      idMap,
    });
    const rel = await importRelations({ client, resolved, bundleDir, unresolved });
    relations = { groups, upserted: rel.upserted, unresolved: rel.unresolved };
    log(
      `relations: ${rel.upserted.length} edges upserted, ` +
        `${rel.unresolved.length} unresolved (see unresolved-links.json)`,
    );
  } finally {
    await client.close();
  }

  // Telemetry: guarded by the state ledger — the estate CLI is plain-INSERT
  // and WOULD duplicate rows on a second run.
  let telemetryResult;
  if (state.telemetry_done) {
    telemetryResult = state.telemetry_done;
    log(
      `telemetry: already imported on ${new Date(telemetryResult.at).toISOString()} — skipping`,
    );
  } else {
    const { resolved, remapped, unmapped } = remapTelemetry(bundle.telemetry, idMap);
    const resolvedPath = join(bundleDir, "telemetry-resolved.json");
    writeFileSync(resolvedPath, JSON.stringify(resolved, null, 2) + "\n", "utf-8");
    const counts = await runTelemetryCli({
      estateBin,
      estateBinArgs,
      file: resolvedPath,
      knowledgeDb,
      env,
    });
    telemetryResult = { ...counts, remapped, unmapped, at: Date.now() };
    state.telemetry_done = telemetryResult;
    saveState(bundleDir, state);
    log(
      `telemetry: ${counts.access} access rows (${remapped} remapped, ${unmapped} raw), ` +
        `${counts.misses} misses imported`,
    );
  }

  const report = buildVerificationReport({
    manifest: bundle.manifest,
    idMap,
    relations,
    telemetryResult,
  });
  writeFileSync(
    join(bundleDir, "verification-report.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf-8",
  );
  return report;
}

/**
 * Recompute the verification report from bundle artifacts alone (no estate
 * calls) — for post-hoc inspection/CI. Requires a completed import (id-map,
 * relations-result, import-state present).
 */
export function verifyBundle(bundleDir) {
  const bundle = loadBundle(bundleDir);
  const idMap = loadIdMap(bundleDir);
  const state = loadState(bundleDir);
  const relationsResult = existsSync(join(bundleDir, "relations-result.json"))
    ? JSON.parse(readFileSync(join(bundleDir, "relations-result.json"), "utf-8"))
    : { upserted: [] };
  const unresolved = existsSync(join(bundleDir, "unresolved-links.json"))
    ? JSON.parse(readFileSync(join(bundleDir, "unresolved-links.json"), "utf-8"))
    : [];
  const groups = aggregateLinks(bundle.links);
  const telemetryResult = state.telemetry_done ?? {
    access: 0,
    misses: 0,
    remapped: 0,
    unmapped: 0,
  };
  return buildVerificationReport({
    manifest: bundle.manifest,
    idMap,
    relations: { groups, upserted: relationsResult.upserted, unresolved },
    telemetryResult,
  });
}
