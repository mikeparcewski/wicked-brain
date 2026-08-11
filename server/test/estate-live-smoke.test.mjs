// LIVE round-trip smoke test: fixture brain → export bundle → import into a
// SCRATCH wicked-estate (real `wicked-estate-mcp` + `wicked-estate` binaries)
// → assert the tuned signals landed in estate's own SQLite stores.
//
// Binary discovery (auto-SKIPS when either binary is absent, e.g. in CI):
//   WICKED_ESTATE_MCP_BIN / WICKED_ESTATE_BIN env vars, else PATH lookup.
//
// Every estate store lives in a fresh scratch dir — the user's real
// ~/.wicked / ~/.wicked-estate are never touched (all four db paths and
// WICKED_HOME are pinned to the scratch dir).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { exportBundle } from "../lib/estate-export.mjs";
import { runImport } from "../lib/estate-import.mjs";
import { buildFixtureBrain } from "./fixtures/build-fixture-brain.mjs";

function findOnPath(name) {
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// A binary being present is not enough — an installed wicked-estate that
// predates the PR #95 contract has no `import-telemetry` subcommand and would
// fail the round trip instead of skipping. Probe the usage text.
function supportsTelemetryImport(bin) {
  try {
    const r = spawnSync(bin, [], { encoding: "utf-8", timeout: 30_000 });
    return `${r.stdout ?? ""}${r.stderr ?? ""}`.includes("import-telemetry");
  } catch {
    return false;
  }
}

const mcpBin = process.env.WICKED_ESTATE_MCP_BIN || findOnPath("wicked-estate-mcp");
const estateBin = process.env.WICKED_ESTATE_BIN || findOnPath("wicked-estate");
const available = !!(mcpBin && estateBin) && supportsTelemetryImport(estateBin);
const skipReason = !mcpBin || !estateBin
  ? "wicked-estate binaries not found (set WICKED_ESTATE_MCP_BIN / WICKED_ESTATE_BIN)"
  : available
    ? false
    : `${estateBin} predates the S1 import contract (no import-telemetry subcommand)`;

test(
  "live round-trip: brain fixture → bundle → real estate scratch stores, twice (idempotent)",
  { skip: available ? false : skipReason },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "wb-estate-live-"));
    const brainPath = join(dir, "brain");
    buildFixtureBrain(brainPath);
    const bundleDir = join(dir, "bundle");
    const manifest = exportBundle({ brainPath, bundleDir });
    assert.equal(manifest.counts.documents, 4);

    const estateHome = join(dir, "estate");
    const graphDb = join(estateHome, "graph.db");
    const memoryDb = join(estateHome, "memory.db");
    const knowledgeDb = join(estateHome, "knowledge.db");
    const xedgeDb = join(estateHome, "xedge.db");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(estateHome, { recursive: true });

    const env = {
      ...process.env,
      WICKED_HOME: estateHome, // belt and braces: no fallback can reach ~/.wicked
      WICKED_ESTATE_DB: graphDb,
      WICKED_MEMORY_DB: memoryDb,
      WICKED_KNOWLEDGE_DB: knowledgeDb,
      WICKED_XEDGE_DB: xedgeDb,
    };

    const opts = {
      bundleDir,
      mcpBin,
      mcpArgs: ["--db", graphDb],
      estateBin,
      knowledgeDb,
      env,
      timeoutMs: 120_000,
      log: (m) => process.stderr.write(`  [smoke] ${m}\n`),
    };

    // ── first import ──
    const report = await runImport(opts);
    assert.equal(report.zero_loss, true, JSON.stringify(report.reconciliation, null, 2));
    assert.equal(report.reconciliation.links.edges_upserted, 2);
    assert.equal(report.reconciliation.access_log.imported, 3);

    // ── the zero-loss proof, straight from estate's own SQLite ──
    const kdb = new Database(knowledgeDb, { readonly: true, fileMustExist: true });
    // Signal 1+2: the tuned link landed with its REAL confidence and the
    // first-class evidence_count column (never estate's 0.8 default).
    const tuned = kdb
      .prepare(`SELECT confidence, evidence_count FROM edges WHERE evidence_count = 4`)
      .all();
    assert.equal(tuned.length, 1, "tuned edge (evidence_count=4) must land exactly once");
    assert.ok(Math.abs(tuned[0].confidence - 0.9) < 1e-6);
    const defaultConf = kdb
      .prepare(
        `SELECT COUNT(*) AS c FROM edges WHERE evidence_count = 0 AND ABS(confidence - 0.5) < 1e-6
         AND data LIKE '%brain-migration%'`,
      )
      .get();
    assert.equal(defaultConf.c, 1, "untuned link must land at brain's 0.5, not estate's 0.8");
    // Signals 3+4: telemetry tables.
    assert.equal(kdb.prepare(`SELECT COUNT(*) AS c FROM access_log`).get().c, 3);
    assert.equal(kdb.prepare(`SELECT COUNT(*) AS c FROM search_misses`).get().c, 2);
    const nullSession = kdb
      .prepare(`SELECT COUNT(*) AS c FROM search_misses WHERE session_id IS NULL`)
      .get();
    assert.equal(nullSession.c, 1, "NULL session_id must survive the round trip");
    const edgeCount1 = kdb.prepare(`SELECT COUNT(*) AS c FROM edges`).get().c;
    kdb.close();

    // Memory landed in the memory store.
    const mdb = new Database(memoryDb, { readonly: true, fileMustExist: true });
    const memNodes = mdb.prepare(`SELECT COUNT(*) AS c FROM nodes`).get().c;
    mdb.close();
    assert.ok(memNodes >= 1, "captured memory must exist in the memory store");

    // ── second import: idempotent ──
    const report2 = await runImport(opts);
    assert.equal(report2.zero_loss, true);
    const kdb2 = new Database(knowledgeDb, { readonly: true, fileMustExist: true });
    assert.equal(
      kdb2.prepare(`SELECT COUNT(*) AS c FROM edges`).get().c,
      edgeCount1,
      "re-run must not duplicate edges (upsert on source/target/kind)",
    );
    assert.equal(
      kdb2.prepare(`SELECT COUNT(*) AS c FROM access_log`).get().c,
      3,
      "re-run must not duplicate telemetry (state-guarded)",
    );
    kdb2.close();
    const mdb2 = new Database(memoryDb, { readonly: true, fileMustExist: true });
    assert.equal(
      mdb2.prepare(`SELECT COUNT(*) AS c FROM nodes`).get().c,
      memNodes,
      "re-run must not duplicate memories (id-map ledger)",
    );
    mdb2.close();
  },
);
