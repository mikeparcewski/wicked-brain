// The pluggable compliance-framework seam: LOAD + EXECUTE behind a fixed interface,
// a config-driven no-op default now, real frameworks as drop-ins later. Testing the
// seam once covers every future drop-in by the same contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noopFramework, registerFramework, hasFramework, loadFramework, executeCompliance,
} from "../lib/conformance-frameworks.mjs";

test("noopFramework: with no config, resolves ANY control as known (passthrough)", () => {
  const fw = noopFramework();
  assert.deepEqual(fw.resolve("CC6.1"), { framework: "noop", control_id: "CC6.1", known: true, title: null });
});

test("noopFramework: a controls fixture turns it into a real gate — unknown control is known:false", () => {
  const fw = noopFramework({ name: "soc2", controls: { "CC6.1": "Logical access" } });
  assert.deepEqual(fw.resolve("CC6.1"), { framework: "soc2", control_id: "CC6.1", known: true, title: "Logical access" });
  assert.deepEqual(fw.resolve("XX9.9"), { framework: "soc2", control_id: "XX9.9", known: false, title: null });
});

test("noopFramework: accepts an array of control ids (titles null)", () => {
  const fw = noopFramework({ name: "pci", controls: ["6.5.1"] });
  assert.equal(fw.resolve("6.5.1").known, true);
  assert.equal(fw.resolve("1.1.1").known, false);
});

test("loadFramework: unregistered → config-driven no-op; registered → the drop-in", () => {
  assert.equal(hasFramework("unregistered-xyz"), false);
  assert.equal(loadFramework("unregistered-xyz").name, "unregistered-xyz");

  // A real framework drops in behind the SAME interface without touching store/enforcement.
  registerFramework("fake-soc2", (cfg) => ({
    name: "fake-soc2",
    resolve: (id) => ({ framework: "fake-soc2", control_id: id, known: id === cfg.only, title: null }),
  }));
  assert.equal(hasFramework("fake-soc2"), true);
  const fw = loadFramework("fake-soc2", { only: "CC6.1" });
  assert.equal(fw.resolve("CC6.1").known, true);
  assert.equal(fw.resolve("CC7.2").known, false);
});

test("registerFramework: rejects a non-function factory", () => {
  assert.throws(() => registerFramework("bad", {}), /must be a function/);
});

test("executeCompliance: a bound rule loads+executes; an unbound rule → null", () => {
  const bound = { id: "POL-001", rule_type: "policy", compliance: { framework: "soc2", control_id: "CC6.1" } };
  const unbound = { id: "PAT-001", rule_type: "pattern" };
  // config is keyed by framework name, so different frameworks get different config
  assert.deepEqual(
    executeCompliance(bound, { soc2: { controls: { "CC6.1": "Logical access" } } }),
    { framework: "soc2", control_id: "CC6.1", known: true, title: "Logical access" },
  );
  assert.equal(executeCompliance(unbound), null);
  // With no config, the no-op still executes (passthrough) rather than failing.
  assert.equal(executeCompliance(bound).known, true);
});
