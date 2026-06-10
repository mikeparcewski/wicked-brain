/**
 * codegraph-dispatch.test.mjs — B3: dispatch (command→agent) injected-edge extractor
 *
 * Tests the extract() function in codegraph-extractors/dispatch.mjs.
 * Uses the real nodes/edges DDL from docs/codegraph-contract.md.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { extract } from "../lib/codegraph-extractors/dispatch.mjs";
import { CodegraphClient } from "../lib/codegraph-client.mjs";
import { dbPath } from "../lib/codegraph-index.mjs";

// Real DDL from docs/codegraph-contract.md
const NODES_DDL = `
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

const EDGES_DDL = `
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

/**
 * Create a temp repo directory with .codegraph/codegraph.db
 * Returns { repo, db } — caller must db.close() and rmSync(repo).
 */
function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "cg-dispatch-"));
  mkdirSync(join(repo, ".codegraph"), { recursive: true });
  const db = new Database(join(repo, ".codegraph", "codegraph.db"));
  db.exec(NODES_DDL);
  db.exec(EDGES_DDL);
  return { repo, db };
}

/** Write a file, creating its parent directory. */
function writeFile(repo, relpath, content) {
  const abs = join(repo, relpath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("dispatch: command with matching agent → one edge inserted", () => {
  const { repo, db } = makeRepo();
  try {
    // Create the command file with a subagent_type reference
    writeFile(repo, "commands/d/c.md", `
# My Command

Task(subagent_type="wicked-garden:d:a")
`);
    // Create the corresponding agent file
    writeFile(repo, "agents/d/a.md", "# Agent A");

    const result = extract({ db, sourcePath: repo });

    assert.equal(result.edges_added, 1, "one edge should be added");
    assert.equal(result.dispatches, 1, "one dispatch resolved");

    const edges = db.prepare("SELECT * FROM edges WHERE provenance = 'injected:dispatch'").all();
    assert.equal(edges.length, 1);

    const edge = edges[0];
    assert.equal(edge.source, "file:commands/d/c.md");
    assert.equal(edge.target, "file:agents/d/a.md");
    assert.equal(edge.kind, "references");
    assert.equal(edge.provenance, "injected:dispatch");

    const meta = JSON.parse(edge.metadata);
    assert.equal(meta.injected, "dispatch");
    assert.equal(meta.subagent_type, "wicked-garden:d:a");
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch: handle with no matching agent file is skipped", () => {
  const { repo, db } = makeRepo();
  try {
    // Command references two handles: one existing agent, one ghost
    writeFile(repo, "commands/d/c.md", `
Task(subagent_type="wicked-garden:d:a")
Task(subagent_type="wicked-garden:d:ghost")
`);
    writeFile(repo, "agents/d/a.md", "# Agent A");
    // agents/d/ghost.md does NOT exist

    const result = extract({ db, sourcePath: repo });

    assert.equal(result.edges_added, 1, "ghost handle must be skipped — only 1 edge");
    assert.equal(result.dispatches, 1, "only the resolved handle counts");

    const edges = db.prepare("SELECT * FROM edges WHERE provenance = 'injected:dispatch'").all();
    assert.equal(edges.length, 1);
    assert.equal(edges[0].target, "file:agents/d/a.md");
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch: idempotent — re-run does not duplicate edges", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "commands/d/c.md", 'Task(subagent_type="wicked-garden:d:a")');
    writeFile(repo, "agents/d/a.md", "# Agent A");

    extract({ db, sourcePath: repo });
    extract({ db, sourcePath: repo }); // second call

    const count = db.prepare(
      "SELECT COUNT(*) AS c FROM edges WHERE provenance = 'injected:dispatch'"
    ).get().c;
    assert.equal(count, 1, "idempotent — still exactly 1 edge after two runs");
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch: no command files → empty result", () => {
  const { repo, db } = makeRepo();
  try {
    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 0);
    assert.equal(result.dispatches, 0);
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch: YAML frontmatter subagent_type is also matched", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "commands/x/cmd.md", `---
subagent_type: wicked-garden:x:worker
---
# Command
`);
    writeFile(repo, "agents/x/worker.md", "# Worker agent");

    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 1);
    assert.equal(result.dispatches, 1);

    const edge = db.prepare("SELECT * FROM edges WHERE provenance = 'injected:dispatch'").get();
    assert.equal(edge.source, "file:commands/x/cmd.md");
    assert.equal(edge.target, "file:agents/x/worker.md");
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch: same handle in multiple commands → one edge per command", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "commands/a/c1.md", 'Task(subagent_type="wicked-garden:a:agent")');
    writeFile(repo, "commands/a/c2.md", 'Task(subagent_type="wicked-garden:a:agent")');
    writeFile(repo, "agents/a/agent.md", "# Agent");

    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 2, "one edge per command file that dispatches");
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch: end-to-end blastRadius — agent surfaces the dispatching command", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "commands/d/c.md", 'Task(subagent_type="wicked-garden:d:a")');
    writeFile(repo, "agents/d/a.md", "# Agent A");

    extract({ db, sourcePath: repo });
    db.close(); // close write handle before opening read-only client

    const client = new CodegraphClient(repo);
    try {
      const result = client.blastRadius({ node: "file:agents/d/a.md" });
      assert.ok(Array.isArray(result.dependents), "dependents must be an array");
      const ids = result.dependents.map((n) => n.id);
      assert.ok(
        ids.includes("file:commands/d/c.md"),
        `Expected file:commands/d/c.md in blast-radius dependents; got: ${JSON.stringify(ids)}`
      );
    } finally {
      client.close();
    }
  } finally {
    // db already closed above
    rmSync(repo, { recursive: true, force: true });
  }
});
