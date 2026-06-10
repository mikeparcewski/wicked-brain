/**
 * codegraph-extract.test.mjs — B4: extractor registry (builtins + drop-ins)
 *
 * Cases:
 *  1. builtins run: a repo wired for the bus extractor → runExtractors returns
 *     a `bus` entry with edges_added >= 1; total_injected_edges >= 1; dropins is [].
 *  2. dropin discovered + run: a dropin .mjs file is imported and called.
 *  3. absent dropin dir → only builtin labels, dropins: [].
 *  4. fail-open: a dropin that throws → its entry is {error:...}, other extractors still ran.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { discoverDropins, runExtractors } from "../lib/codegraph-extract.mjs";

// ── Real DDL (from docs/codegraph-contract.md) ────────────────────────────────

const REAL_NODES_DDL = `
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    docstring TEXT,
    signature TEXT,
    visibility TEXT,
    is_exported INTEGER DEFAULT 0,
    is_async INTEGER DEFAULT 0,
    is_static INTEGER DEFAULT 0,
    is_abstract INTEGER DEFAULT 0,
    decorators TEXT,
    type_parameters TEXT,
    updated_at INTEGER NOT NULL
)`;

const REAL_EDGES_DDL = `
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL,
    metadata TEXT,
    line INTEGER,
    col INTEGER,
    provenance TEXT DEFAULT NULL,
    FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
)`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function insertFileNode(db, relpath, language = "python") {
  db.prepare(`INSERT OR IGNORE INTO nodes
    (id, kind, name, qualified_name, file_path, language,
     start_line, end_line, start_column, end_column, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0, 0, ?)`)
    .run(`file:${relpath}`, "file", relpath.split("/").pop(), relpath, relpath, language, Date.now());
}

/**
 * Build a repo dir with a .codegraph/codegraph.db (real DDL), scripts/ with
 * a bus producer + consumer wiring. Returns { repo, dbPath }.
 */
function makeBusWiredRepo() {
  const repo = mkdtempSync(join(tmpdir(), "cg-ext-"));
  mkdirSync(join(repo, ".codegraph"), { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });

  const dbFile = join(repo, ".codegraph", "codegraph.db");
  const db = new Database(dbFile);
  db.exec(REAL_NODES_DDL);
  db.exec(REAL_EDGES_DDL);
  insertFileNode(db, "scripts/producer.py");
  insertFileNode(db, "scripts/consumer.py");
  db.close();

  writeFileSync(
    join(repo, "scripts", "_bus_consumers.json"),
    JSON.stringify({
      consumers: [
        { event_filter: "wicked.thing.happened", module: "scripts/consumer.py" },
      ],
    }),
  );
  writeFileSync(
    join(repo, "scripts", "producer.py"),
    'emit_event("wicked.thing.happened")\n',
  );

  return { repo, dbFile };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("B4-1: builtins run — bus extractor adds edges_added >= 1, dropins is []", async () => {
  const { repo, dbFile } = makeBusWiredRepo();
  try {
    const db = new Database(dbFile);
    const result = await runExtractors({ db, sourcePath: repo });
    db.close();

    assert.ok(result.bus, "bus key must be present");
    assert.ok(result.bus.edges_added >= 1,
      `bus.edges_added must be >= 1, got ${result.bus.edges_added}`);
    assert.ok(result.total_injected_edges >= 1,
      `total_injected_edges must be >= 1, got ${result.total_injected_edges}`);
    assert.deepEqual(result.dropins, [], "no dropins expected");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("B4-2: dropin discovered + run — marker.mjs adds 1 edge; dropins includes it", async () => {
  const { repo, dbFile } = makeBusWiredRepo();
  try {
    // Write a drop-in extractor
    const dropinDir = join(repo, ".codegraph-extractors");
    mkdirSync(dropinDir, { recursive: true });
    // NOTE: this imports and runs code from the target repo — by design (trusted repo extractors)
    writeFileSync(
      join(dropinDir, "marker.mjs"),
      `export function extract({db}) {
  db.prepare("INSERT INTO edges (source,target,kind,metadata,provenance) VALUES ('file:scripts/producer.py','file:scripts/consumer.py','references',null,'dropin:marker')").run();
  return { edges_added: 1 };
}
`,
    );

    const db = new Database(dbFile);
    const result = await runExtractors({ db, sourcePath: repo });
    db.close();

    assert.ok("dropin:marker.mjs" in result,
      `result must have dropin:marker.mjs key; got keys: ${Object.keys(result).join(", ")}`);
    assert.equal(result["dropin:marker.mjs"].edges_added, 1);
    assert.ok(result.dropins.includes("dropin:marker.mjs"),
      `dropins must include dropin:marker.mjs; got: ${JSON.stringify(result.dropins)}`);
    assert.ok(result.total_injected_edges >= 1,
      `total_injected_edges must count dropin; got ${result.total_injected_edges}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("B4-3: absent dropin dir — only builtin labels, dropins is []", async () => {
  const { repo, dbFile } = makeBusWiredRepo();
  try {
    const db = new Database(dbFile);
    const result = await runExtractors({ db, sourcePath: repo });
    db.close();

    // Builtin labels must be present
    assert.ok("bus" in result, "bus key must be present");
    assert.ok("dispatch" in result, "dispatch key must be present");
    assert.ok("capability" in result, "capability key must be present");
    assert.deepEqual(result.dropins, []);
    // No extra unknown keys beyond builtins + meta
    const knownMeta = new Set(["total_injected_edges", "dropins"]);
    const builtinLabels = new Set(["bus", "dispatch", "capability"]);
    for (const k of Object.keys(result)) {
      assert.ok(knownMeta.has(k) || builtinLabels.has(k),
        `unexpected key in result: ${k}`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("B4-4: fail-open — a throwing dropin leaves {error} entry; builtin labels still present", async () => {
  const { repo, dbFile } = makeBusWiredRepo();
  try {
    const dropinDir = join(repo, ".codegraph-extractors");
    mkdirSync(dropinDir, { recursive: true });
    writeFileSync(
      join(dropinDir, "broken.mjs"),
      `export function extract() { throw new Error("intentional failure"); }\n`,
    );

    const db = new Database(dbFile);
    const result = await runExtractors({ db, sourcePath: repo });
    db.close();

    // The broken dropin must have an error entry
    assert.ok("dropin:broken.mjs" in result,
      `result must have dropin:broken.mjs key; got: ${Object.keys(result).join(", ")}`);
    assert.ok(typeof result["dropin:broken.mjs"].error === "string",
      "error must be a string");
    assert.ok(result["dropin:broken.mjs"].error.length > 0,
      "error must be non-empty");

    // Builtins must still be present and have counts (not error)
    assert.ok("bus" in result, "bus key must still be present");
    assert.ok(!("error" in result.bus), `bus must not have error; got: ${JSON.stringify(result.bus)}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("B4-discoverDropins: absent dir returns []", async () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-ext-empty-"));
  try {
    const result = await discoverDropins(repo);
    assert.deepEqual(result, []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("B4-discoverDropins: broken dropin import is skipped, valid one included", async () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-ext-di-"));
  try {
    const dropinDir = join(repo, ".codegraph-extractors");
    mkdirSync(dropinDir, { recursive: true });

    // Valid dropin
    writeFileSync(
      join(dropinDir, "valid.mjs"),
      `export function extract() { return { edges_added: 0 }; }\n`,
    );
    // Broken dropin (syntax error via bad import)
    writeFileSync(
      join(dropinDir, "broken.mjs"),
      `THIS IS NOT VALID JS\n`,
    );

    const result = await discoverDropins(repo);
    const labels = result.map((d) => d.label);
    assert.ok(labels.includes("dropin:valid.mjs"),
      `valid.mjs should be discovered; got: ${JSON.stringify(labels)}`);
    assert.ok(!labels.includes("dropin:broken.mjs"),
      "broken.mjs must be skipped");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
