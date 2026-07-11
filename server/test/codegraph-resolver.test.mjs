import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCodegraph } from "../lib/codegraph-resolver.mjs";

test("env override wins and is split into argv", () => {
  const argv = resolveCodegraph({ env: { WICKED_CODEGRAPH_BIN: "/opt/cg" } });
  assert.deepEqual(argv, ["/opt/cg"]);
});

test("a .mjs/.js env target is invoked via node", () => {
  const argv = resolveCodegraph({ env: { WICKED_CODEGRAPH_BIN: "/x/cg.mjs" } });
  assert.deepEqual(argv, ["node", "/x/cg.mjs"]);
});

test("set-but-empty env is the kill switch -> null", () => {
  assert.equal(resolveCodegraph({ env: { WICKED_CODEGRAPH_BIN: "" } }), null);
});

test("brain config _meta/codegraph.json bin is honored", () => {
  const brain = mkdtempSync(join(tmpdir(), "cg-cfg-"));
  mkdirSync(join(brain, "_meta"), { recursive: true });
  writeFileSync(join(brain, "_meta", "codegraph.json"), JSON.stringify({ bin: "/cfg/cg" }));
  try {
    const argv = resolveCodegraph({ env: {}, brainPath: brain, which: () => null });
    assert.deepEqual(argv, ["/cfg/cg"]);
  } finally {
    rmSync(brain, { recursive: true, force: true });
  }
});

test("falls back to npx when nothing else resolves", () => {
  const argv = resolveCodegraph({ env: {}, which: (c) => (c === "npx" ? "/usr/bin/npx" : null) });
  assert.deepEqual(argv, ["npx", "-y", "@colbymchenry/codegraph"]);
});

test("no npx and nothing resolves -> null", () => {
  assert.equal(resolveCodegraph({ env: {}, which: () => null }), null);
});
