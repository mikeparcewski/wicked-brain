import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegistry } from "../lib/canonical-registry.mjs";
import {
  runLintRules,
  ruleDuplicateCanonicalFor,
  ruleBrokenReference,
  ruleLongPageLowRefs,
  ruleMissingCanonicalPurpose,
  lintExitCode,
  formatFindings,
} from "../lib/lint-wiki.mjs";

test("duplicate_canonical_for: flags two pages claiming same ID", () => {
  const reg = buildRegistry([
    { path: "wiki/a.md", data: { canonical_for: ["X"] } },
    { path: "wiki/b.md", data: { canonical_for: ["X"] } },
  ]);
  const findings = ruleDuplicateCanonicalFor(reg);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, "error");
  assert.equal(findings[0].rule, "duplicate_canonical_for");
  assert.deepEqual(findings[0].extra.paths, ["wiki/a.md", "wiki/b.md"]);
});

test("duplicate_canonical_for: clean when every ID has one owner", () => {
  const reg = buildRegistry([
    { path: "wiki/a.md", data: { canonical_for: ["X"] } },
    { path: "wiki/b.md", data: { canonical_for: ["Y"] } },
  ]);
  assert.deepEqual(ruleDuplicateCanonicalFor(reg), []);
});

test("broken_reference: flags unresolved canonical ID", () => {
  const reg = buildRegistry([
    { path: "wiki/extend.md", data: { references: ["INV-GHOST"] } },
  ]);
  const findings = ruleBrokenReference(reg, new Set());
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, "error");
  assert.equal(findings[0].extra.ref, "INV-GHOST");
});

test("broken_reference: clean when ref resolves to canonical ID", () => {
  const reg = buildRegistry([
    { path: "wiki/inv.md", data: { canonical_for: ["INV-A"] } },
    { path: "wiki/extend.md", data: { references: ["INV-A"] } },
  ]);
  assert.deepEqual(ruleBrokenReference(reg, new Set()), []);
});

test("broken_reference: clean when ref resolves to known path", () => {
  const reg = buildRegistry([
    { path: "wiki/extend.md", data: { references: ["CLAUDE.md"] } },
  ]);
  assert.deepEqual(ruleBrokenReference(reg, new Set(["CLAUDE.md"])), []);
});

test("broken_reference: external URLs skipped", () => {
  const reg = buildRegistry([
    { path: "wiki/x.md", data: { references: ["https://example.com/doc"] } },
  ]);
  assert.deepEqual(ruleBrokenReference(reg, new Set()), []);
});

test("broken_reference: path#anchor resolves when path exists", () => {
  const reg = buildRegistry([
    { path: "wiki/x.md", data: { references: ["CLAUDE.md#cross-platform"] } },
  ]);
  assert.deepEqual(ruleBrokenReference(reg, new Set(["CLAUDE.md"])), []);
});

test("long_page_low_refs: fires on long page with few references", () => {
  const pages = [
    { path: "wiki/long.md", data: { references: [] }, lineCount: 120 },
  ];
  const findings = ruleLongPageLowRefs(pages);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, "warn");
  assert.equal(findings[0].rule, "long_page_low_refs");
});

test("long_page_low_refs: skips when enough references", () => {
  const pages = [
    {
      path: "wiki/long.md",
      data: { references: ["A", "B", "C"] },
      lineCount: 120,
    },
  ];
  assert.deepEqual(ruleLongPageLowRefs(pages), []);
});

test("long_page_low_refs: skips generated pages", () => {
  const pages = [
    {
      path: "wiki/contract-api.md",
      data: { generated: true, references: [] },
      lineCount: 500,
    },
  ];
  assert.deepEqual(ruleLongPageLowRefs(pages), []);
});

test("long_page_low_refs: thresholds configurable", () => {
  const pages = [{ path: "p", data: { references: [] }, lineCount: 90 }];
  assert.equal(ruleLongPageLowRefs(pages, { longPageLines: 100 }).length, 0);
  assert.equal(ruleLongPageLowRefs(pages, { longPageLines: 50 }).length, 1);
});

test("long_page_low_refs: exempts pages owning multiple canonical IDs", () => {
  const pages = [
    {
      path: "wiki/invariants.md",
      data: { canonical_for: ["A", "B", "C"], references: [] },
      lineCount: 500,
    },
  ];
  assert.deepEqual(ruleLongPageLowRefs(pages), []);
});

test("long_page_low_refs: single-canonical recipe page is NOT exempt", () => {
  const pages = [
    {
      path: "wiki/extend-x.md",
      data: { canonical_for: ["RECIPE-X"], references: [] },
      lineCount: 200,
    },
  ];
  const findings = ruleLongPageLowRefs(pages);
  assert.equal(findings.length, 1);
});

test("missing_canonical_purpose: fires when page owns nothing and cites nothing", () => {
  const pages = [{ path: "wiki/orphan.md", data: {}, lineCount: 20 }];
  const findings = ruleMissingCanonicalPurpose(pages);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, "warn");
});

test("missing_canonical_purpose: quiet when page has canonical_for", () => {
  const pages = [
    { path: "wiki/x.md", data: { canonical_for: ["X"] }, lineCount: 20 },
  ];
  assert.deepEqual(ruleMissingCanonicalPurpose(pages), []);
});

test("missing_canonical_purpose: quiet when page has references", () => {
  const pages = [
    { path: "wiki/x.md", data: { references: ["INV-A"] }, lineCount: 20 },
  ];
  assert.deepEqual(ruleMissingCanonicalPurpose(pages), []);
});

test("missing_canonical_purpose: skips generated pages", () => {
  const pages = [
    { path: "wiki/gen.md", data: { generated: true }, lineCount: 20 },
  ];
  assert.deepEqual(ruleMissingCanonicalPurpose(pages), []);
});

test("runLintRules: composes all rules", () => {
  const reg = buildRegistry([
    { path: "wiki/inv.md", data: { canonical_for: ["INV-A"] } },
    { path: "wiki/dup1.md", data: { canonical_for: ["INV-X"] } },
    { path: "wiki/dup2.md", data: { canonical_for: ["INV-X"] } },
    { path: "wiki/bad-ref.md", data: { references: ["INV-GHOST"] } },
  ]);
  const pages = [
    { path: "wiki/inv.md", data: { canonical_for: ["INV-A"], references: [] }, lineCount: 10 },
    { path: "wiki/dup1.md", data: { canonical_for: ["INV-X"] }, lineCount: 10 },
    { path: "wiki/dup2.md", data: { canonical_for: ["INV-X"] }, lineCount: 10 },
    { path: "wiki/bad-ref.md", data: { references: ["INV-GHOST"] }, lineCount: 10 },
    { path: "wiki/orphan.md", data: {}, lineCount: 10 },
  ];
  const findings = runLintRules({ registry: reg, pages });
  const rules = findings.map((f) => f.rule).sort();
  assert.ok(rules.includes("duplicate_canonical_for"));
  assert.ok(rules.includes("broken_reference"));
  assert.ok(rules.includes("missing_canonical_purpose"));
});

test("lintExitCode: errors trigger exit 1", () => {
  const findings = [{ rule: "duplicate_canonical_for", level: "error", page: "x", message: "m" }];
  assert.equal(lintExitCode(findings), 1);
});

test("lintExitCode: only warnings → exit 0 unless strict", () => {
  const findings = [{ rule: "long_page_low_refs", level: "warn", page: "x", message: "m" }];
  assert.equal(lintExitCode(findings), 0);
  assert.equal(lintExitCode(findings, { strict: true }), 1);
});

test("lintExitCode: no findings → exit 0", () => {
  assert.equal(lintExitCode([]), 0);
  assert.equal(lintExitCode([], { strict: true }), 0);
});

test("formatFindings: stable text output", () => {
  const findings = [
    { rule: "duplicate_canonical_for", level: "error", page: "wiki/a.md", message: "X claimed twice" },
    { rule: "long_page_low_refs", level: "warn", page: "wiki/b.md", message: "too long" },
  ];
  const text = formatFindings(findings);
  assert.ok(text.includes("[error] wiki/a.md"));
  assert.ok(text.includes("[warn] wiki/b.md"));
});

test("formatFindings: clean message when empty", () => {
  assert.equal(formatFindings([]), "wiki lint: clean.");
});
