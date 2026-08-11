// Builds a small but signal-complete fixture .brain.db for the estate export
// tests, using the REAL SqliteSearch class so the schema (and the wikilink →
// links extraction, migrations, tuned-signal columns) is exactly what
// production writes — never a hand-rolled imitation.
//
// Fixture contents (4 documents, 6 link rows, 3 access rows, 2 misses):
//   memory/decision-alpha.md          type: decision, tier: semantic
//                                     → links to the alpha chunk (memory-source link)
//   chunks/extracted/alpha/chunk-001.md
//                                     → wiki/topic.md TWICE (duplicate rows),
//                                     → missing/nowhere.md (broken link)
//   chunks/extracted/beta/chunk-001.md (no links)
//   wiki/topic.md                     → supports::alpha chunk (typed link)
//   + one raw cross-brain link row (target_brain = "other-brain")
//   + the alpha→wiki link tuned via the REAL confirmLink path: 4 confirms
//     ⇒ confidence 0.9, evidence_count 4
//   + access_log: alpha chunk (s1), the memory (s2), a ghost doc id (s1)
//   + search_misses: one with a session, one with NULL session

import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SqliteSearch } from "../../lib/sqlite-search.mjs";

export const FIXTURE_BRAIN_ID = "test-brain";

export const ALPHA_CHUNK = "chunks/extracted/alpha/chunk-001.md";
export const BETA_CHUNK = "chunks/extracted/beta/chunk-001.md";
export const WIKI_TOPIC = "wiki/topic.md";
export const MEMORY_DOC = "memory/decision-alpha.md";
export const GHOST_DOC_ID = "ghost/deleted.md";

export const MEMORY_CONTENT = `---
type: decision
tier: semantic
importance: 7
tags: [sqlite, storage]
---
We chose SQLite over Postgres for local-first storage.
See [[${ALPHA_CHUNK}]] for the trade-off notes.
`;

export const ALPHA_CONTENT = `---
source_path: src/alpha.mjs
content_hash: abc12345
---
Alpha module notes. Related: [[${WIKI_TOPIC}]] and again [[${WIKI_TOPIC}]].
Also referenced: [[missing/nowhere.md]].
`;

export const BETA_CONTENT = `---
source_path: src/beta.mjs
---
Beta module notes with no outbound links.
`;

export const WIKI_CONTENT = `---
title: Topic
description: Synthesized article
---
The topic article. [[supports::${ALPHA_CHUNK}]]
`;

/**
 * Build the fixture brain at `brainPath` (created if needed). Returns the
 * .brain.db path. Contents can be overridden per-doc (used by the failure-path
 * test to plant a FAIL_ME marker).
 */
export function buildFixtureBrain(brainPath, { alphaContent = ALPHA_CONTENT } = {}) {
  mkdirSync(brainPath, { recursive: true });
  writeFileSync(
    join(brainPath, "brain.json"),
    JSON.stringify({ id: FIXTURE_BRAIN_ID }) + "\n",
    "utf-8",
  );
  const dbPath = join(brainPath, ".brain.db");

  const search = new SqliteSearch(dbPath, FIXTURE_BRAIN_ID);
  // Brain convention: document id == relative path.
  search.index({ id: MEMORY_DOC, path: MEMORY_DOC, content: MEMORY_CONTENT });
  search.index({ id: ALPHA_CHUNK, path: ALPHA_CHUNK, content: alphaContent });
  search.index({ id: BETA_CHUNK, path: BETA_CHUNK, content: BETA_CONTENT });
  search.index({ id: WIKI_TOPIC, path: WIKI_TOPIC, content: WIKI_CONTENT });

  // Tune the alpha→wiki link through the REAL confirm path: 4 confirms
  // ⇒ confidence 0.5 + 4×0.1 = 0.9, evidence_count 4.
  for (let i = 0; i < 4; i++) {
    search.confirmLink(ALPHA_CHUNK, WIKI_TOPIC, "confirm");
  }
  search.close();

  // Raw rows the class has no writer for: cross-brain link + telemetry.
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO links (source_id, source_brain, target_path, target_brain, rel, link_text, confidence, evidence_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ALPHA_CHUNK, FIXTURE_BRAIN_ID, "shared/elsewhere.md", "other-brain", null, "[[other-brain::shared/elsewhere.md]]", 0.5, 0);

  const insAccess = db.prepare(
    `INSERT INTO access_log (doc_id, session_id, accessed_at) VALUES (?, ?, ?)`,
  );
  insAccess.run(ALPHA_CHUNK, "s1", 1700000000000);
  insAccess.run(MEMORY_DOC, "s2", 1700000100000);
  insAccess.run(GHOST_DOC_ID, "s1", 1700000200000);

  const insMiss = db.prepare(
    `INSERT INTO search_misses (query, searched_at, session_id) VALUES (?, ?, ?)`,
  );
  insMiss.run("how does rrf fusion work", 1700000300000, "s1");
  insMiss.run("vault evidence gate", 1700000400000, null);
  db.close();

  return dbPath;
}
