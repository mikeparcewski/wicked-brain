/**
 * codegraph-capability.test.mjs — B3: capability (agent→cap) injected-edge extractor
 *
 * Tests the extract() function in codegraph-extractors/capability.mjs.
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
import { extract } from "../lib/codegraph-extractors/capability.mjs";
import { CodegraphClient } from "../lib/codegraph-client.mjs";

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
  const repo = mkdtempSync(join(tmpdir(), "cg-capability-"));
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

test("capability: agent with tool-capabilities frontmatter → 2 edges and 2 cap nodes", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "agents/d/a.md", `---
tool-capabilities:
  - security-scanning
  - version-control
---
# Agent A
`);

    const result = extract({ db, sourcePath: repo });

    assert.equal(result.edges_added, 2, "two capability edges");
    assert.equal(result.capabilities, 2, "two distinct capability nodes created");

    const edges = db.prepare(
      "SELECT * FROM edges WHERE provenance = 'injected:capability' ORDER BY target"
    ).all();
    assert.equal(edges.length, 2);

    const targets = edges.map((e) => e.target).sort();
    assert.deepEqual(targets, [
      "capability:security-scanning",
      "capability:version-control",
    ]);

    for (const edge of edges) {
      assert.equal(edge.source, "file:agents/d/a.md");
      assert.equal(edge.kind, "references");
      assert.equal(edge.provenance, "injected:capability");
      const meta = JSON.parse(edge.metadata);
      assert.equal(meta.injected, "capability");
      assert.ok(typeof meta.capability === "string");
    }

    // Verify the capability nodes exist in the nodes table
    const capNodes = db.prepare(
      "SELECT id, kind, name FROM nodes WHERE kind = 'capability' ORDER BY id"
    ).all();
    assert.equal(capNodes.length, 2);
    assert.equal(capNodes[0].id, "capability:security-scanning");
    assert.equal(capNodes[1].id, "capability:version-control");
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("capability: idempotent — re-run produces no duplicate edges or nodes", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "agents/d/a.md", `---
tool-capabilities:
  - security-scanning
  - version-control
---
# Agent A
`);

    extract({ db, sourcePath: repo });
    extract({ db, sourcePath: repo }); // second call

    const edgeCount = db.prepare(
      "SELECT COUNT(*) AS c FROM edges WHERE provenance = 'injected:capability'"
    ).get().c;
    assert.equal(edgeCount, 2, "idempotent — still exactly 2 edges");

    const nodeCount = db.prepare(
      "SELECT COUNT(*) AS c FROM nodes WHERE kind = 'capability'"
    ).get().c;
    assert.equal(nodeCount, 2, "idempotent — still exactly 2 capability nodes");
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("capability: agent without tool-capabilities → no edges", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "agents/x/no-caps.md", `---
description: an agent with no capability declarations
---
# No Caps Agent
`);

    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 0);
    assert.equal(result.capabilities, 0);
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("capability: no agent files → empty result", () => {
  const { repo, db } = makeRepo();
  try {
    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 0);
    assert.equal(result.capabilities, 0);
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("capability: duplicate cap items in same agent are deduped", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "agents/d/a.md", `---
tool-capabilities:
  - security-scanning
  - security-scanning
  - version-control
---
# Agent A
`);

    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 2, "duplicates within same agent deduped → 2 edges");
    assert.equal(result.capabilities, 2);

    const edgeCount = db.prepare(
      "SELECT COUNT(*) AS c FROM edges WHERE provenance = 'injected:capability'"
    ).get().c;
    assert.equal(edgeCount, 2);
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("capability: multiple agents sharing a cap → one node, multiple edges", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "agents/a/agent1.md", `---
tool-capabilities:
  - security-scanning
---
# Agent 1
`);
    writeFile(repo, "agents/b/agent2.md", `---
tool-capabilities:
  - security-scanning
---
# Agent 2
`);

    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 2, "two edges — one per agent");
    assert.equal(result.capabilities, 1, "only one distinct capability node");

    const nodeCount = db.prepare(
      "SELECT COUNT(*) AS c FROM nodes WHERE id = 'capability:security-scanning'"
    ).get().c;
    assert.equal(nodeCount, 1);
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("capability: end-to-end blastRadius — capability surfaces the declaring agent", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "agents/d/a.md", `---
tool-capabilities:
  - security-scanning
  - version-control
---
# Agent A
`);

    extract({ db, sourcePath: repo });
    db.close(); // close write handle before opening read-only client

    const client = new CodegraphClient(repo);
    try {
      const result = client.blastRadius({ node: "capability:security-scanning" });
      assert.ok(Array.isArray(result.dependents), "dependents must be an array");
      const ids = result.dependents.map((n) => n.id);
      assert.ok(
        ids.includes("file:agents/d/a.md"),
        `Expected file:agents/d/a.md in blast-radius dependents; got: ${JSON.stringify(ids)}`
      );
    } finally {
      client.close();
    }
  } finally {
    // db already closed above
    rmSync(repo, { recursive: true, force: true });
  }
});

// ─── Skills layout (agents→skills consolidation) ──────────────────────────────

test("capability/skills: SKILL.md tool-capabilities frontmatter → edges + cap nodes", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "skills/platform-security-engineer/SKILL.md", `---
name: wicked-garden-platform-security-engineer
subagent_type: wicked-garden:platform:security-engineer
context: fork
allowed-tools: Read, Grep, Glob, Bash
tool-capabilities:
  - security-scanning
  - version-control
---
# Security Engineer
`);

    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 2, "two capability edges from the skill");
    assert.equal(result.capabilities, 2);

    const edges = db.prepare(
      "SELECT * FROM edges WHERE provenance = 'injected:capability' ORDER BY target"
    ).all();
    assert.equal(edges.length, 2);
    for (const edge of edges) {
      assert.equal(edge.source, "file:skills/platform-security-engineer/SKILL.md");
    }
    const targets = edges.map((e) => e.target).sort();
    assert.deepEqual(targets, [
      "capability:security-scanning",
      "capability:version-control",
    ]);
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("capability/skills: non-SKILL.md files under skills/ are ignored", () => {
  const { repo, db } = makeRepo();
  try {
    // A refs/*.md doc that happens to contain a tool-capabilities block must NOT
    // be treated as a capability-declaring agent.
    writeFile(repo, "skills/foo/refs/notes.md", `---
tool-capabilities:
  - should-not-count
---
`);

    const result = extract({ db, sourcePath: repo });
    assert.equal(result.edges_added, 0);
    assert.equal(result.capabilities, 0);
  } finally {
    db.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("capability/skills: end-to-end blastRadius — capability surfaces the declaring skill", () => {
  const { repo, db } = makeRepo();
  try {
    writeFile(repo, "skills/agentic-safety-reviewer/SKILL.md", `---
name: wicked-garden-agentic-safety-reviewer
tool-capabilities:
  - security-scanning
---
# Safety Reviewer
`);

    extract({ db, sourcePath: repo });
    db.close();

    const client = new CodegraphClient(repo);
    try {
      const result = client.blastRadius({ node: "capability:security-scanning" });
      const ids = result.dependents.map((n) => n.id);
      assert.ok(
        ids.includes("file:skills/agentic-safety-reviewer/SKILL.md"),
        `Expected declaring skill in dependents; got: ${JSON.stringify(ids)}`
      );
    } finally {
      client.close();
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
