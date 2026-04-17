import { test } from "node:test";
import assert from "node:assert/strict";
import { extractActions, renderContractApi, renderActionsJson } from "../lib/gen-contract-api.mjs";

const SAMPLE = `
import { something } from "x";

const actions = {
  health: () => db.health(),
  search: (p) => {
    const result = db.search(p);
    return result;
  },
  stats: () => db.stats(),
  "lsp-health": () => lsp.health(),
  symbols: async (p) => {
    const r = await lsp.workspaceSymbols({ query: p.name });
    return r;
  },
  manual: () => ({ ok: true }),
};

const server = createServer(() => {});
`;

test("extractActions: finds every top-level action", () => {
  const actions = extractActions(SAMPLE);
  const names = actions.map((a) => a.name);
  assert.deepEqual(names, ["health", "search", "stats", "lsp-health", "symbols", "manual"]);
});

test("extractActions: captures db/lsp implementation targets", () => {
  const actions = extractActions(SAMPLE);
  const search = actions.find((a) => a.name === "search");
  assert.deepEqual(search.impls, [{ target: "server/lib/sqlite-search.mjs", method: "search" }]);
  const lspHealth = actions.find((a) => a.name === "lsp-health");
  assert.deepEqual(lspHealth.impls, [{ target: "server/lib/lsp-client.mjs", method: "health" }]);
});

test("extractActions: detects async handler", () => {
  const actions = extractActions(SAMPLE);
  const symbols = actions.find((a) => a.name === "symbols");
  assert.equal(symbols.async, true);
  const health = actions.find((a) => a.name === "health");
  assert.equal(health.async, false);
});

test("extractActions: lists params used from p.xxx pattern", () => {
  const actions = extractActions(SAMPLE);
  const symbols = actions.find((a) => a.name === "symbols");
  assert.deepEqual(symbols.params, ["name"]);
});

test("extractActions: no db/lsp call yields empty impls", () => {
  const actions = extractActions(SAMPLE);
  const manual = actions.find((a) => a.name === "manual");
  assert.deepEqual(manual.impls, []);
  assert.deepEqual(manual.params, []);
});

test("extractActions: throws when the actions block is missing", () => {
  assert.throws(() => extractActions("no actions here"), /actions/);
});

test("renderContractApi: includes canonical_for frontmatter", () => {
  const md = renderContractApi({
    actions: extractActions(SAMPLE),
    generatedAt: "2026-04-17",
    sourcePath: "server/bin/wicked-brain-server.mjs",
  });
  assert.ok(md.startsWith("---\n"));
  assert.ok(md.includes("canonical_for: [CONTRACT-API]"));
  assert.ok(md.includes("generated: true"));
});

test("renderContractApi: table row per action", () => {
  const md = renderContractApi({
    actions: extractActions(SAMPLE),
    generatedAt: "2026-04-17",
    sourcePath: "server/bin/wicked-brain-server.mjs",
  });
  for (const name of ["health", "search", "stats", "lsp-health", "symbols", "manual"]) {
    assert.ok(md.includes(`\`${name}\``), `missing row for ${name}`);
  }
});

test("renderContractApi: per-action anchor section for each action", () => {
  const md = renderContractApi({
    actions: extractActions(SAMPLE),
    generatedAt: "2026-04-17",
    sourcePath: "server/bin/wicked-brain-server.mjs",
  });
  // Each H3 starts with `### ` followed by the action name in backticks
  for (const name of ["health", "search", "stats"]) {
    assert.ok(md.includes(`### \`${name}\``));
  }
});

test("renderActionsJson: shape is stable", () => {
  const actions = extractActions(SAMPLE);
  const json = renderActionsJson({
    actions,
    generatedAt: "2026-04-17",
    sourcePath: "server/bin/wicked-brain-server.mjs",
  });
  assert.equal(json.canonical_id, "CONTRACT-API");
  assert.equal(json.count, actions.length);
  assert.equal(json.generated_at, "2026-04-17");
  assert.equal(json.actions.length, actions.length);
});

test("extractActions: works against the real server source", async () => {
  const fs = await import("node:fs/promises");
  const url = new URL("../bin/wicked-brain-server.mjs", import.meta.url);
  const src = await fs.readFile(url, "utf8");
  const actions = extractActions(src);
  const names = actions.map((a) => a.name);
  // Sanity: a handful of actions we know exist.
  for (const expected of ["health", "search", "stats", "index", "remove", "reindex", "lsp-health"]) {
    assert.ok(names.includes(expected), `missing ${expected}; got ${names.join(", ")}`);
  }
});
