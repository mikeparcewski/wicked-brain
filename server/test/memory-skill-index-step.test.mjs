import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for the store→recall race (issue #40): the memory skill must
// synchronously `index` a freshly-written memory BEFORE it is considered stored,
// rather than relying on the async, debounced file watcher. If this structure
// regresses, a store followed by a same-turn recall can silently miss the memory.
const SKILL = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "skills",
  "wicked-brain-memory",
  "SKILL.md",
);

test("memory skill invokes a synchronous index in the store flow", async () => {
  const md = await fs.readFile(SKILL, "utf8");

  const idxCall = md.indexOf("wicked-brain-call index");
  assert.ok(
    idxCall >= 0,
    "store flow must call `wicked-brain-call index` (synchronous FTS upsert), not rely on the watcher",
  );

  const logStep = md.indexOf("Log the store event");
  assert.ok(logStep >= 0, "expected the 'Log the store event' step to exist");
  assert.ok(
    idxCall < logStep,
    "the synchronous index call must come before the log step, i.e. inside the store flow before recall",
  );

  assert.ok(
    /do\s+\*?\*?not\*?\*?\s+rely on the file watcher alone/i.test(md),
    "store flow must warn against relying on the async file watcher alone",
  );
});
