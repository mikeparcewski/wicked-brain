import { test } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteSearch } from "../lib/sqlite-search.mjs";

// Regression: federatedSearch used a schema-qualified FTS5 MATCH target
// (`brain_x.documents_fts MATCH ?`), which FTS5 rejects. The error was
// swallowed and the brain silently marked unreachable. The MATCH operand
// must be the bare table name, scoped via the FROM clause.
test("federatedSearch finds matches in an attached brain", () => {
  // Attached brain must be a real file — cannot ATTACH another connection's :memory:.
  const attPath = join(tmpdir(), `wicked-brain-federated-test-${Date.now()}.db`);
  try {
    const att = new SqliteSearch(attPath, "att-brain");
    att.index({ id: "att1", path: "att/topic.md", content: "wicked brain federated search target" });
    att.close();

    // Main brain shares the "wicked" keyword to prove results scope to the
    // attached table and don't bleed across databases.
    const main = new SqliteSearch(":memory:", "main-brain");
    try {
      main.index({ id: "main1", path: "main/local.md", content: "wicked local main row" });

      const result = main.federatedSearch({
        query: "federated",
        brains: [{ brainId: "att-brain", dbPath: attPath }],
      });

      assert.deepEqual(result.unreachable, [], "attached brain must not be marked unreachable");
      assert.ok(
        result.results.map((r) => r.id).includes("att1"),
        "federated result must include the attached-brain match"
      );
    } finally {
      main.close();
    }
  } finally {
    try { unlinkSync(attPath); } catch {}
    try { unlinkSync(attPath + "-wal"); } catch {}
    try { unlinkSync(attPath + "-shm"); } catch {}
  }
});
