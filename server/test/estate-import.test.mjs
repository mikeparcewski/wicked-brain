// Tests for the estate IMPORT phase (server/lib/estate-import.mjs), driven
// against the fake wicked-estate-mcp / wicked-estate fixtures — no estate
// binaries required. Covers: id-mapping, explicit confidence/evidence_count
// on relations, the unresolved-links fail-loud manifest, telemetry remapping,
// idempotent re-runs, and verification-report exit semantics.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exportBundle } from "../lib/estate-export.mjs";
import {
  runImport,
  verifyBundle,
  loadIdMap,
  aggregateLinks,
  remapTelemetry,
  parseTelemetryOutput,
  memoryCaptureArgs,
  knowledgeWriteArgs,
  MIGRATION_PROVENANCE,
  DEFAULT_REL,
} from "../lib/estate-import.mjs";
import {
  buildFixtureBrain,
  FIXTURE_BRAIN_ID,
  ALPHA_CHUNK,
  WIKI_TOPIC,
  MEMORY_DOC,
  GHOST_DOC_ID,
  ALPHA_CONTENT,
} from "./fixtures/build-fixture-brain.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_MCP = join(__dirname, "fixtures", "fake-estate-mcp.mjs");
const FAKE_CLI = join(__dirname, "fixtures", "fake-estate-cli.mjs");

function jsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/** Build fixture brain + bundle, return paths and an importOpts factory. */
function setup({ alphaContent } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wb-estate-import-"));
  const brainPath = join(dir, "brain");
  buildFixtureBrain(brainPath, alphaContent ? { alphaContent } : {});
  const bundleDir = join(dir, "bundle");
  exportBundle({ brainPath, bundleDir });

  const importOpts = (runTag) => {
    const mcpLog = join(dir, `mcp-calls-${runTag}.jsonl`);
    const cliLog = join(dir, `cli-calls-${runTag}.jsonl`);
    return {
      opts: {
        bundleDir,
        mcpBin: process.execPath,
        mcpArgs: [FAKE_MCP, "--serve"],
        estateBin: process.execPath,
        estateBinArgs: [FAKE_CLI],
        knowledgeDb: join(dir, "knowledge.db"),
        env: { ...process.env, FAKE_MCP_LOG: mcpLog, FAKE_ESTATE_CLI_LOG: cliLog },
        timeoutMs: 15_000,
      },
      mcpLog,
      cliLog,
    };
  };
  return { dir, brainPath, bundleDir, importOpts };
}

test("full import: id-map, relations with explicit tuned values, unresolved manifest, telemetry remap, zero loss", async () => {
  const { bundleDir, importOpts } = setup();
  const { opts, mcpLog, cliLog } = importOpts("run1");
  const report = await runImport(opts);

  // ── verification report: every row reconciles ──
  assert.equal(report.zero_loss, true);
  assert.deepEqual(report.reconciliation.memories, { expected: 1, landed: 1, unaccounted: 0 });
  assert.deepEqual(report.reconciliation.chunks, { expected: 2, landed: 2, unaccounted: 0 });
  assert.deepEqual(report.reconciliation.wiki, { expected: 1, landed: 1, unaccounted: 0 });
  assert.deepEqual(report.reconciliation.links, {
    expected_rows: 6,
    aggregated_edges: 5, // the duplicate alpha→wiki rows collapse into one edge
    duplicate_rows_collapsed: 1,
    edges_upserted: 2, // alpha→wiki, wiki→alpha
    groups_unresolved: 3, // memory_endpoint, target_no_document, cross_brain_target
    unaccounted: 0,
  });
  assert.deepEqual(report.reconciliation.access_log, {
    expected: 3,
    imported: 3,
    remapped_to_estate_ids: 2,
    kept_raw_brain_ids: 1,
    unaccounted: 0,
  });
  assert.deepEqual(report.reconciliation.search_misses, {
    expected: 2,
    imported: 2,
    unaccounted: 0,
  });

  // ── id-map ledger: one entry per document, correct tool routing ──
  const idMap = loadIdMap(bundleDir);
  assert.equal(idMap.size, 4);
  assert.equal(idMap.get(MEMORY_DOC).tool, "memory.capture");
  assert.match(idMap.get(MEMORY_DOC).estate_id, /^mem::/);
  assert.equal(idMap.get(ALPHA_CHUNK).tool, "knowledge.write");
  assert.match(idMap.get(ALPHA_CHUNK).estate_id, /^kchunk::/);
  assert.match(idMap.get(WIKI_TOPIC).estate_id, /^kconcept::/, "wiki must land as concept (recallable)");

  // ── the MCP calls carried the REAL per-link values, explicitly ──
  const calls = jsonl(mcpLog);
  const relates = calls.filter((c) => c.tool === "knowledge.relate");
  assert.equal(relates.length, 2);
  const tunedRelate = relates.find((c) => c.args.rel === DEFAULT_REL);
  assert.ok(tunedRelate, "untyped link must relate as the default rel");
  assert.ok(Math.abs(tunedRelate.args.confidence - 0.9) < 1e-9, "tuned confidence must be sent");
  assert.equal(tunedRelate.args.evidence_count, 4, "tuned evidence_count must be sent");
  assert.equal(tunedRelate.args.provenance, MIGRATION_PROVENANCE);
  const typedRelate = relates.find((c) => c.args.rel === "supports");
  assert.ok(typedRelate, "typed link rel must pass through");
  // The un-tuned link's 0.5 must be sent EXPLICITLY (estate defaults to 0.8).
  assert.equal(typedRelate.args.confidence, 0.5);
  assert.equal(typedRelate.args.evidence_count, 0);

  // Memory capture routed with mapped kind/tier and full original content.
  const capture = calls.find((c) => c.tool === "memory.capture");
  assert.equal(capture.args.kind, "fact"); // brain type: decision
  assert.equal(capture.args.tier, "semantic");
  assert.match(capture.args.content, /type: decision/, "frontmatter must survive in content");
  assert.equal(capture.args.scope, `brain/${FIXTURE_BRAIN_ID}/${MEMORY_DOC}`);

  // knowledge.write carried per-doc-unique provenance.
  const writes = calls.filter((c) => c.tool === "knowledge.write");
  assert.equal(writes.length, 3);
  assert.ok(
    writes.every((c) => c.args.source.startsWith(`wicked-brain://${FIXTURE_BRAIN_ID}/`)),
  );

  // ── unresolved manifest is loud and reasoned ──
  const unresolved = JSON.parse(readFileSync(join(bundleDir, "unresolved-links.json"), "utf-8"));
  assert.equal(unresolved.length, 3);
  const reasons = unresolved.map((u) => u.reason).sort();
  assert.deepEqual(reasons, ["cross_brain_target", "memory_endpoint", "target_no_document"]);

  // ── telemetry remap: landed ids remapped, ghost kept raw, ran exactly once ──
  const resolved = JSON.parse(readFileSync(join(bundleDir, "telemetry-resolved.json"), "utf-8"));
  const itemIds = resolved.access_log.map((r) => r.item_id);
  assert.ok(itemIds.includes(idMap.get(ALPHA_CHUNK).estate_id));
  assert.ok(itemIds.includes(idMap.get(MEMORY_DOC).estate_id));
  assert.ok(itemIds.includes(GHOST_DOC_ID), "unmappable rows keep the raw brain id (zero loss)");
  assert.equal(jsonl(cliLog).length, 1);

  // verification-report.json persisted and matches.
  const onDisk = JSON.parse(readFileSync(join(bundleDir, "verification-report.json"), "utf-8"));
  assert.deepEqual(onDisk.reconciliation, report.reconciliation);
});

test("re-running the import is idempotent: no duplicate content, telemetry guarded", async () => {
  const { bundleDir, importOpts } = setup();
  const first = importOpts("run1");
  const report1 = await runImport(first.opts);
  assert.equal(report1.zero_loss, true);
  const idMapAfter1 = [...loadIdMap(bundleDir).entries()].map(([k, v]) => [k, v.estate_id]);

  const second = importOpts("run2");
  const report2 = await runImport(second.opts);
  assert.equal(report2.zero_loss, true);

  // The ledger froze the mapping — same size, same estate ids.
  const idMapAfter2 = [...loadIdMap(bundleDir).entries()].map(([k, v]) => [k, v.estate_id]);
  assert.deepEqual(idMapAfter2, idMapAfter1);

  // Second run made ZERO capture/write calls (all docs already mapped) …
  const calls2 = jsonl(second.mcpLog);
  assert.equal(calls2.filter((c) => c.tool === "memory.capture").length, 0);
  assert.equal(calls2.filter((c) => c.tool === "knowledge.write").length, 0);
  // … while relations re-upsert (estate keys edges on source/target/kind).
  assert.equal(calls2.filter((c) => c.tool === "knowledge.relate").length, 2);
  // Telemetry did NOT run again (the estate CLI is plain-INSERT).
  assert.equal(jsonl(second.cliLog).length, 0);
});

test("verify subcommand recomputes the same report from bundle artifacts", async () => {
  const { bundleDir, importOpts } = setup();
  const report = await runImport(importOpts("run1").opts);
  const recomputed = verifyBundle(bundleDir);
  assert.equal(recomputed.zero_loss, true);
  assert.deepEqual(recomputed.reconciliation, report.reconciliation);
});

test("a content failure yields unaccounted rows and zero_loss=false", async () => {
  const { bundleDir, importOpts } = setup({
    alphaContent: ALPHA_CONTENT.replace("Alpha module notes.", "Alpha FAIL_ME notes."),
  });
  const report = await runImport(importOpts("run1").opts);
  assert.equal(report.zero_loss, false);
  assert.equal(report.reconciliation.chunks.unaccounted, 1);
  const failures = JSON.parse(readFileSync(join(bundleDir, "content-failures.json"), "utf-8"));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].brain_doc_id, ALPHA_CHUNK);
  // Links from/to the failed doc are accounted as unresolved, not lost:
  // alpha→wiki (source_not_landed), wiki→alpha (target_not_landed),
  // plus the base memory_endpoint / target_no_document / cross_brain_target.
  assert.equal(report.reconciliation.links.unaccounted, 0);
  const unresolved = JSON.parse(readFileSync(join(bundleDir, "unresolved-links.json"), "utf-8"));
  assert.ok(unresolved.some((u) => u.reason === "source_not_landed"));
  assert.ok(unresolved.some((u) => u.reason === "target_not_landed"));
});

test("aggregateLinks collapses duplicates keeping the tuned row's values", () => {
  const rows = [
    { source_id: "a", target_path: "b", rel: null, confidence: 0.5, evidence_count: 0 },
    { source_id: "a", target_path: "b", rel: null, confidence: 0.9, evidence_count: 4 },
    { source_id: "a", target_path: "b", rel: "supports", confidence: 0.5, evidence_count: 0 },
  ];
  const groups = aggregateLinks(rows);
  assert.equal(groups.length, 2, "same (src,tgt) with different rel stays distinct");
  const untyped = groups.find((g) => g.rel === null);
  assert.equal(untyped.row_count, 2);
  assert.equal(untyped.evidence_count, 4, "max evidence_count wins");
  assert.equal(untyped.confidence, 0.9, "the tuned row's confidence rides along");
});

test("remapTelemetry maps landed ids and preserves unknown ids raw", () => {
  const idMap = new Map([["doc-1", { estate_id: "kchunk::9" }]]);
  const { resolved, remapped, unmapped } = remapTelemetry(
    {
      access_log: [
        { item_id: "doc-1", session_id: "s", accessed_at: 1 },
        { item_id: "gone", session_id: "s", accessed_at: 2 },
      ],
      search_misses: [{ query: "q", searched_at: 3, session_id: null }],
    },
    idMap,
  );
  assert.equal(remapped, 1);
  assert.equal(unmapped, 1);
  assert.deepEqual(
    resolved.access_log.map((r) => r.item_id),
    ["kchunk::9", "gone"],
  );
  assert.equal(resolved.search_misses.length, 1);
});

test("parseTelemetryOutput reads the real CLI summary line", () => {
  assert.deepEqual(
    parseTelemetryOutput("import-telemetry: imported 217 access-log row(s), 120 search-miss(es) into /x/k.db\n"),
    { access: 217, misses: 120 },
  );
  assert.equal(parseTelemetryOutput("garbage"), null);
});

test("memoryCaptureArgs maps brain type/tier onto estate's closed vocabulary", () => {
  const doc = (fm) => ({
    id: "memory/m.md",
    path: "memory/m.md",
    content: `---\n${fm}\n---\nbody`,
    frontmatter: fm,
    source_type: "memory",
  });
  assert.equal(memoryCaptureArgs(doc("type: decision\ntier: semantic"), "b").kind, "fact");
  assert.equal(memoryCaptureArgs(doc("type: pattern\ntier: working"), "b").kind, "skill");
  assert.equal(memoryCaptureArgs(doc("type: gotcha\ntier: episodic"), "b").kind, "fact");
  assert.equal(memoryCaptureArgs(doc("type: discovery\ntier: episodic"), "b").kind, "episode");
  // Unknown type/tier fall back to estate-safe defaults (estate fails closed).
  const weird = memoryCaptureArgs(doc("type: vibe\ntier: cosmic"), "b");
  assert.equal(weird.kind, "episode");
  assert.equal(weird.tier, "episodic");
  // No frontmatter at all.
  const bare = memoryCaptureArgs(
    { id: "memory/x.md", path: "memory/x.md", content: "just text", source_type: "memory" },
    "b",
  );
  assert.equal(bare.kind, "episode");
  assert.equal(bare.tier, "episodic");
});

test("knowledgeWriteArgs routes wiki to concept and chunks to chunk", () => {
  const wiki = knowledgeWriteArgs(
    { id: "wiki/a.md", path: "wiki/a.md", content: "w", source_type: "wiki" },
    "brainy",
  );
  assert.equal(wiki.class, "concept");
  assert.equal(wiki.scope, "brain/brainy");
  assert.equal(wiki.source, "wicked-brain://brainy/wiki/a.md");
  const chunk = knowledgeWriteArgs(
    { id: "chunks/c.md", path: "chunks/c.md", content: "c", source_type: "chunk" },
    "brainy",
  );
  assert.equal(chunk.class, "chunk");
});

test("CLI: export end-to-end and bad invocations", async () => {
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "wb-estate-cli-"));
  const brainPath = join(dir, "brain");
  buildFixtureBrain(brainPath);
  const bin = join(__dirname, "..", "bin", "wicked-brain-estate.mjs");

  const ok = spawnSync(
    process.execPath,
    [bin, "export", "--brain", brainPath, "--out", join(dir, "bundle")],
    { encoding: "utf-8" },
  );
  assert.equal(ok.status, 0, ok.stderr);
  const manifest = JSON.parse(ok.stdout);
  assert.equal(manifest.counts.documents, 4);

  const noArgs = spawnSync(process.execPath, [bin], { encoding: "utf-8" });
  assert.equal(noArgs.status, 2);
  assert.match(noArgs.stdout, /Usage:/);

  const badCmd = spawnSync(process.execPath, [bin, "frobnicate"], { encoding: "utf-8" });
  assert.equal(badCmd.status, 2);

  const importNoHome = spawnSync(
    process.execPath,
    [bin, "import", "--bundle", join(dir, "bundle")],
    { encoding: "utf-8" },
  );
  assert.equal(importNoHome.status, 2);
  assert.match(importNoHome.stderr, /estate-home/);
});
