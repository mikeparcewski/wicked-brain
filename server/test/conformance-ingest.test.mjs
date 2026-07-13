import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import {
  filesystemAdapter, confluenceAdapter, sharepointAdapter,
  normalizeDoc, parseMarkdownDoc, toDocument, DEFAULT_INGEST_CONFIDENCE,
} from "../lib/conformance-ingest.mjs";
import { validate } from "../lib/schema-validate.mjs";
import { schemas } from "../../schemas/index.mjs";

function seedDir() {
  const dir = mkdtempSync(join(tmpdir(), "conf-ingest-"));
  // A markdown rule doc with frontmatter + a body-as-statement fallback path is
  // exercised separately; here the statement lives in frontmatter.
  writeFileSync(join(dir, "layering.md"), [
    "---",
    "id: PAT-100",
    "rule_type: pattern",
    "severity: error",
    "layer: repository",
    "language: typescript",
    "confidence: 0.9",
    "statement: The repository layer must not import the web layer.",
    "---",
    "Longer prose explanation that should be ignored for the statement.",
  ].join("\n"));
  // A JSON rule doc (array form).
  writeFileSync(join(dir, "secrets.json"), JSON.stringify([
    {
      id: "POL-100", rule_type: "policy", severity: "critical",
      statement: "No secret literals in source.", confidence: 0.99,
    },
  ]));
  return dir;
}

test("filesystem adapter: round-trips .md + .json docs into candidate rules with doc provenance", () => {
  const dir = seedDir();
  const adapter = filesystemAdapter({ dir, source: "acme/guild" });
  assert.equal(adapter.name, "filesystem");
  const rules = adapter.ingest();
  assert.equal(rules.length, 2);

  const md = rules.find((r) => r.id === "PAT-100");
  assert.ok(md);
  assert.equal(md.rule_type, "pattern");
  assert.equal(md.severity, "error");
  assert.deepEqual(md.targets, { layer: "repository", language: "typescript" });
  assert.equal(md.confidence, 0.9);
  assert.equal(md.provenance.source, "acme/guild");
  assert.equal(md.provenance.ref, "layering.md");
  assert.deepEqual(md.provenance.source_kinds, ["doc"]); // doc-sourced => trust-eligible only

  const js = rules.find((r) => r.id === "POL-100");
  assert.ok(js);
  assert.equal(js.rule_type, "policy");
  assert.equal(js.severity, "critical");
  assert.equal(js.provenance.ref, "secrets.json");
});

test("filesystem adapter: ingested candidates -> toDocument validates against the schema", () => {
  const dir = seedDir();
  const rules = filesystemAdapter({ dir, source: "acme/guild" }).ingest();
  const doc = toDocument(rules, { source: "acme/guild" });
  assert.equal(doc.metadata.schema_version, "1.0.0");
  const errs = validate(doc, schemas["conformance-rules"]);
  assert.deepEqual(errs, [], errs.join("\n"));
});

test("markdown parse: a body statement is used when frontmatter omits one; default confidence applies", () => {
  const fields = parseMarkdownDoc([
    "---",
    "rule_type: policy",
    "severity: warn",
    "---",
    "# All handlers must authenticate before touching a resource.",
    "extra prose",
  ].join("\n"));
  assert.equal(fields.rule_type, "policy");
  assert.equal(fields.statement, "All handlers must authenticate before touching a resource.");

  const rule = normalizeDoc(fields, { source: "s", ref: "authn.md" });
  assert.equal(rule.confidence, DEFAULT_INGEST_CONFIDENCE);
  assert.equal(rule.id, "POL-001"); // synthesized with the policy prefix
});

test("normalizeDoc: a missing/invalid rule_type fails loud (never fabricated)", () => {
  assert.throws(() => normalizeDoc({ statement: "x" }, { source: "s", ref: "r.md" }), /rule_type/);
  assert.throws(() => normalizeDoc({ rule_type: "guideline", statement: "x" }, { source: "s", ref: "r.md" }), /rule_type/);
});

test("normalizeDoc: a missing statement fails loud", () => {
  assert.throws(() => normalizeDoc({ rule_type: "pattern" }, { source: "s", ref: "r.md" }), /statement/);
});

test("stubbed connectors: Confluence + SharePoint throw cleanly behind the shared interface", () => {
  const c = confluenceAdapter({ spaceKey: "ARCH" });
  assert.equal(c.name, "confluence");
  assert.throws(() => c.ingest(), /not implemented/);

  const s = sharepointAdapter({ siteId: "abc" });
  assert.equal(s.name, "sharepoint");
  assert.throws(() => s.ingest(), /not implemented/);
});
