// Contract test for the PRODUCTION estate seam (EstateCliClient / normalizeNode).
// The fixture client is exercised elsewhere; this locks the mapping from estate's
// REAL `nodes --json --semantics` output onto the interface Node shape, and proves
// that shape flows through the coverage classifier — the wiring-phase blocker was
// that estate emits no flat requirement/rule_confidence/out_edges, so every node
// classified as "unaccounted" and coverage could never reach 1.0.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNode, appFromFile } from "../lib/estate-client.mjs";
import { classifyNode } from "../lib/coverage.mjs";

// A node exactly as `wicked-estate nodes --json --semantics` emits it.
const estateSemanticsRow = {
  symbol_id: "sym::pay::charge",
  name: "charge",
  kind: "Function", // estate emits PascalCase NodeKind Debug names
  file: "src/pay/charge.js",
  line: 12,
  signature: "charge(amount)",
  annotation_summary: { count: 1, by_type: { business_rule: 1 }, has_advisory: false },
  annotations: [{ type: "business_rule", key: "business_rule", value: "…", confidence: 0.91 }],
  requirement: "REQ-PAY-001",
  requirement_validated: true,
  rule_confidence: 0.91,
  out_edges: ["Calls", "Imports"], // estate EdgeKind Debug names
};

test("normalizeNode: maps the estate `--semantics` node shape onto the interface Node (lower-casing PascalCase kinds)", () => {
  const n = normalizeNode(estateSemanticsRow);
  assert.equal(n.symbol_id, "sym::pay::charge");
  assert.equal(n.kind, "function"); // PascalCase → lower-case to match brain's config kind-sets
  assert.equal(n.rule_confidence, 0.91);
  assert.equal(n.requirement, "REQ-PAY-001");
  assert.equal(n.requirement_validated, true);
  assert.deepEqual(n.out_edges, ["calls", "imports"]); // lower-cased to match behavior_edge_kinds
  assert.equal(n.app, "src"); // leading path segment
});

test("estate seam end-to-end: a --semantics node classifies as RESOLVED, not unaccounted", () => {
  // The exact blocker: without these fields the classifier saw every node as unaccounted.
  const n = normalizeNode(estateSemanticsRow);
  assert.equal(classifyNode(n, 0.75), "resolved");
});

test("normalizeNode: a bare `nodes --json` node (no --semantics) degrades safely", () => {
  const bare = {
    symbol_id: "sym::x", name: "x", kind: "function", file: "a/x.js", line: 1,
    annotation_summary: { count: 0, by_type: {}, has_advisory: false },
  };
  const n = normalizeNode(bare);
  assert.equal(n.rule_confidence, null);
  assert.equal(n.requirement, null);
  assert.equal(n.requirement_validated, false);
  assert.deepEqual(n.out_edges, []);
  assert.equal(classifyNode(n, 0.75), "unaccounted");
});

test("appFromFile: derives the app from the leading path segment", () => {
  assert.equal(appFromFile("billing/src/charge.js"), "billing");
  assert.equal(appFromFile("./x.js"), "x.js");
  assert.equal(appFromFile(""), "default");
});
