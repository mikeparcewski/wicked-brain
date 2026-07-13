// LIVE round-trip smoke for the PRODUCTION estate seam (EstateCliClient WRITE path).
//
// The read path of EstateCliClient is validated end-to-end elsewhere; its two WRITE
// methods — annotate(...) and set_requirement(...) — were only ever exercised against
// the fixture client, never a real estate DB. This proves they actually write to, and
// read back from, a live `wicked-estate` binary: index a tiny fixture, resolve a symbol,
// annotate + set a requirement through the CLIENT, then read both back (also exercising
// `nodes --json --semantics` end-to-end via list_nodes()).
//
// CI has no estate binary, so this MUST skip gracefully there. We resolve a binary from
// PATH or the sibling `../wicked-estate/target/{debug,release}` build; if none exists the
// test is registered with { skip } and the suite stays green. We never BUILD estate here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EstateCliClient } from "../lib/estate-client.mjs";

/** Locate a runnable `wicked-estate`: PATH first, then the sibling debug/release build.
 *  Returns the binary path/name, or null if none is available (→ the test skips). */
function resolveEstateBin() {
  // 1. On PATH? Probe with --version; ENOENT means "not found", any other outcome
  //    (ran, even non-zero) means the binary exists and is usable.
  try {
    execFileSync("wicked-estate", ["--version"], { stdio: "ignore" });
    return "wicked-estate";
  } catch (err) {
    if (err && err.code !== "ENOENT") return "wicked-estate";
  }
  // 2. Sibling checkout build: ../wicked-estate/target/{debug,release}/wicked-estate[.exe]
  const here = path.dirname(fileURLToPath(import.meta.url)); // server/test
  const repoRoot = path.resolve(here, "..", ".."); // wicked-brain
  const bases = ["debug", "release"].map((profile) =>
    path.join(repoRoot, "..", "wicked-estate", "target", profile, "wicked-estate"),
  );
  for (const base of bases) {
    for (const cand of [base, `${base}.exe`]) {
      if (fs.existsSync(cand)) return cand;
    }
  }
  return null;
}

const bin = resolveEstateBin();
const opts = bin ? {} : { skip: "no wicked-estate binary" };

test("estate live seam: annotate + set_requirement write→read round-trip", opts, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "estate-live-smoke-"));
  try {
    // Tiny fixture: one file, one exported function.
    fs.writeFileSync(
      path.join(dir, "charge.js"),
      "export function charge(amount){ return amount > 0; }\n",
    );
    const db = path.join(dir, "estate.db");

    // Index the fixture into a throwaway DB. Indexing has no client method, so this is
    // the one legitimate raw shell-out; every WRITE/READ below goes through the client.
    execFileSync(bin, ["index", dir, "--db", db], { stdio: "ignore" });

    const estate = new EstateCliClient({ bin, db });

    // 1. resolve name → symbol_id
    const [symbol_id] = estate.resolve("charge", { kind: "Function" });
    assert.ok(symbol_id, "resolve() returned a symbol_id for charge");

    // 2. WRITE an annotation (client → `annotate --symbol ... --confidence 0.9 ...`)
    estate.annotate({
      symbol_id,
      type: "business_rule",
      key: "business_rule",
      value: "charge must be positive",
      confidence: 0.9,
      provenance: "brain:test",
    });

    // 3. WRITE a requirement (client → `semantics <id> --requirement REQ-TEST-1 --validated true`)
    estate.set_requirement(symbol_id, "REQ-TEST-1", true);

    // 4. READ the annotation back — proves the annotate WRITE landed.
    const anns = estate.read_annotations(symbol_id, "business_rule");
    assert.equal(anns.length, 1, "one business_rule annotation read back");
    assert.equal(anns[0].confidence, 0.9, "annotation confidence round-trips as 0.9");
    assert.equal(anns[0].value, "charge must be positive");

    // 5. READ the node via list_nodes() (`nodes --json --semantics`) — proves the
    //    annotate + set_requirement WRITEs surface through the semantics-enriched shape.
    const node = estate.list_nodes().find((n) => n.symbol_id === symbol_id);
    assert.ok(node, "list_nodes() includes the charge node");
    assert.equal(node.rule_confidence, 0.9, "rule_confidence === 0.9");
    assert.equal(node.requirement, "REQ-TEST-1", 'requirement === "REQ-TEST-1"');
    assert.equal(node.requirement_validated, true, "requirement_validated === true");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
