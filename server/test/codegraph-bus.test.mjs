/**
 * codegraph-bus.test.mjs — B2: bus producer->consumer edge extractor
 *
 * Direction: source=consumer (dependent), target=producer (dependency)
 * DEPENDENTS_BY="target", so blastRadius(producer) finds WHERE target=producer → source=consumer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { CodegraphClient } from "../lib/codegraph-client.mjs";
import { extract } from "../lib/codegraph-extractors/bus.mjs";

// Real DDL from docs/codegraph-contract.md
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

function insertFileNode(db, relpath, language = "python") {
  db.prepare(`INSERT OR IGNORE INTO nodes
    (id, kind, name, qualified_name, file_path, language,
     start_line, end_line, start_column, end_column, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0, 0, ?)`)
    .run(`file:${relpath}`, "file", relpath.split("/").pop(), relpath, relpath, language, Date.now());
}

function makeFixture() {
  const repo = mkdtempSync(join(tmpdir(), "cg-bus-"));
  mkdirSync(join(repo, ".codegraph"), { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });

  // Create the DB with real schema
  const dbPath = join(repo, ".codegraph", "codegraph.db");
  const db = new Database(dbPath);
  db.exec(REAL_NODES_DDL);
  db.exec(REAL_EDGES_DDL);

  // Insert the two file nodes
  insertFileNode(db, "scripts/producer.py");
  insertFileNode(db, "scripts/consumer.py");
  db.close();

  // Write bus consumers registry
  writeFileSync(
    join(repo, "scripts", "_bus_consumers.json"),
    JSON.stringify({
      consumers: [
        { event_filter: "wicked.thing.happened", module: "scripts/consumer.py" }
      ]
    })
  );

  // Write producer file
  writeFileSync(
    join(repo, "scripts", "producer.py"),
    'emit_event("wicked.thing.happened")\n'
  );

  return { repo, dbPath };
}

test("extract adds 1 bus edge, correct direction: source=consumer, target=producer", () => {
  const { repo, dbPath } = makeFixture();
  try {
    const db = new Database(dbPath);
    const result = extract({ db, sourcePath: repo });
    db.close();

    assert.equal(result.edges_added, 1, `expected 1 edge, got ${result.edges_added}`);
    assert.equal(result.skipped, 0);
    assert.equal(result.consumers, 1);

    // Verify edge direction: source=consumer (dependent), target=producer (dependency)
    const readDb = new Database(dbPath, { readonly: true });
    const edge = readDb.prepare(
      "SELECT source, target, kind, provenance, metadata FROM edges WHERE provenance = ?"
    ).get("injected:bus");
    readDb.close();

    assert.ok(edge, "edge must exist");
    assert.equal(edge.source, "file:scripts/consumer.py",
      "source must be the consumer (dependent)");
    assert.equal(edge.target, "file:scripts/producer.py",
      "target must be the producer (dependency)");
    assert.equal(edge.kind, "references");
    assert.equal(edge.provenance, "injected:bus");

    const meta = JSON.parse(edge.metadata);
    assert.equal(meta.event, "wicked.thing.happened");
    assert.equal(meta.injected, "bus");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("end-to-end direction proof: blastRadius(producer) surfaces consumer as dependent", () => {
  const { repo, dbPath } = makeFixture();
  try {
    // Write edges
    const db = new Database(dbPath);
    extract({ db, sourcePath: repo });
    db.close();

    // Use CodegraphClient (readonly) to verify blast-radius
    const c = new CodegraphClient(repo);
    const r = c.blastRadius({ node: "file:scripts/producer.py" });
    c.close();

    const ids = r.dependents.map((d) => d.id);
    assert.ok(
      ids.includes("file:scripts/consumer.py"),
      `consumer must appear in blast-radius of producer; got: ${JSON.stringify(ids)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("extract is idempotent — re-run leaves exactly 1 bus edge (no dupes)", () => {
  const { repo, dbPath } = makeFixture();
  try {
    const db1 = new Database(dbPath);
    extract({ db: db1, sourcePath: repo });
    db1.close();

    const db2 = new Database(dbPath);
    extract({ db: db2, sourcePath: repo });
    db2.close();

    const readDb = new Database(dbPath, { readonly: true });
    const count = readDb.prepare(
      "SELECT COUNT(*) AS c FROM edges WHERE provenance = ?"
    ).get("injected:bus").c;
    readDb.close();

    assert.equal(count, 1, `expected exactly 1 bus edge after 2 runs, got ${count}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("extract returns zero when _bus_consumers.json is missing", () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-bus-empty-"));
  mkdirSync(join(repo, ".codegraph"), { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });
  const dbPath = join(repo, ".codegraph", "codegraph.db");
  const db = new Database(dbPath);
  db.exec(REAL_NODES_DDL);
  db.exec(REAL_EDGES_DDL);

  const result = extract({ db, sourcePath: repo });
  db.close();

  assert.equal(result.edges_added, 0);
  assert.equal(result.consumers, 0);
  rmSync(repo, { recursive: true, force: true });
});

test("extract skips consumer when its node does not exist in the graph", () => {
  const repo = mkdtempSync(join(tmpdir(), "cg-bus-skip-"));
  mkdirSync(join(repo, ".codegraph"), { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });
  const dbPath = join(repo, ".codegraph", "codegraph.db");
  const db = new Database(dbPath);
  db.exec(REAL_NODES_DDL);
  db.exec(REAL_EDGES_DDL);
  // Only insert producer, NOT consumer
  insertFileNode(db, "scripts/producer.py");

  writeFileSync(
    join(repo, "scripts", "_bus_consumers.json"),
    JSON.stringify({
      consumers: [
        { event_filter: "wicked.thing.happened", module: "scripts/consumer.py" }
      ]
    })
  );
  writeFileSync(join(repo, "scripts", "producer.py"), 'emit_event("wicked.thing.happened")\n');

  const result = extract({ db, sourcePath: repo });
  db.close();

  assert.equal(result.edges_added, 0);
  assert.equal(result.skipped, 1);
  rmSync(repo, { recursive: true, force: true });
});
