import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFileRecord,
  renderFileMap,
  renderFileMapJson,
} from "../lib/gen-file-map.mjs";

test("buildFileRecord: extracts purpose from leading JSDoc", () => {
  const src = `/**
 * A focused module doing one thing well.
 *
 * More detail here that should not be in purpose.
 */
export function doThing() {}
`;
  const r = buildFileRecord({ relPath: "server/lib/thing.mjs", source: src });
  assert.equal(r.purpose, "A focused module doing one thing well.");
});

test("buildFileRecord: empty purpose when no JSDoc", () => {
  const src = `import x from "./x.mjs";
export function a() {}
`;
  const r = buildFileRecord({ relPath: "server/lib/x.mjs", source: src });
  assert.equal(r.purpose, "");
});

test("buildFileRecord: extracts named exports (function, class, const)", () => {
  const src = `
export function foo() {}
export async function bar() {}
export class Baz {}
export const QUX = 1;
function notExported() {}
`;
  const r = buildFileRecord({ relPath: "f.mjs", source: src });
  assert.deepEqual(r.exports, ["Baz", "QUX", "bar", "foo"]);
});

test("buildFileRecord: extracts named exports from export list", () => {
  const src = `
function a() {}
function b() {}
export { a, b as renamedB };
`;
  const r = buildFileRecord({ relPath: "f.mjs", source: src });
  assert.ok(r.exports.includes("a"));
  assert.ok(r.exports.includes("b"));
});

test("buildFileRecord: captures relative imports only (skips bare specifiers)", () => {
  const src = `
import Database from "better-sqlite3";
import { parseWikilinks } from "./wikilinks.mjs";
import fs from "node:fs";
import { foo } from "../lib/foo.mjs";
`;
  const r = buildFileRecord({ relPath: "f.mjs", source: src });
  assert.deepEqual(r.imports, ["../lib/foo.mjs", "./wikilinks.mjs"]);
});

test("renderFileMap: canonical_for + table rows", () => {
  const files = [
    { path: "a.mjs", purpose: "Thing A.", exports: ["a"], imports: [] },
    { path: "b.mjs", purpose: "Thing B.", exports: ["b"], imports: ["./a.mjs"] },
  ];
  const md = renderFileMap({ files, generatedAt: "2026-04-17", sourceRoots: ["server/lib"] });
  assert.ok(md.includes("canonical_for: [MAP-FILES]"));
  assert.ok(md.includes("`a.mjs`"));
  assert.ok(md.includes("`b.mjs`"));
  assert.ok(md.includes("`./a.mjs`"));
});

test("renderFileMap: purpose with pipe character is escaped", () => {
  const files = [
    { path: "x.mjs", purpose: "Does a | b.", exports: [], imports: [] },
  ];
  const md = renderFileMap({ files, generatedAt: "2026-04-17", sourceRoots: ["server/lib"] });
  assert.ok(md.includes("Does a \\| b."));
});

test("renderFileMapJson: shape is stable", () => {
  const files = [{ path: "a.mjs", purpose: "x", exports: ["a"], imports: [] }];
  const json = renderFileMapJson({ files, generatedAt: "2026-04-17", sourceRoots: ["server/lib"] });
  assert.equal(json.canonical_id, "MAP-FILES");
  assert.equal(json.count, 1);
  assert.deepEqual(json.source_roots, ["server/lib"]);
});
