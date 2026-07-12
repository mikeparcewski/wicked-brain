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

  // Bound the search to the store flow (after the write step) so an `index`
  // mention elsewhere (intro/config) can't satisfy this guard as a false positive.
  const writeStep = md.indexOf("### Step 5: Write memory file");
  const logStep = md.indexOf("Log the store event");
  assert.ok(writeStep >= 0, "expected the 'Write memory file' step to exist");
  assert.ok(logStep >= 0, "expected the 'Log the store event' step to exist");

  const idxCall = md.indexOf("wicked-brain-call index", writeStep);
  assert.ok(
    idxCall >= 0 && idxCall < logStep,
    "store flow must call `wicked-brain-call index` (synchronous FTS upsert) between the write step and the log step — not rely on the watcher",
  );

  assert.ok(
    /do\s+\*?\*?not\*?\*?\s+rely on the file watcher alone/i.test(md),
    "store flow must warn against relying on the async file watcher alone",
  );
});
