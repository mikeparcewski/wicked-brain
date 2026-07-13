// Coverage engine — the resolved-or-flagged gate predicate (ports coverage.py).
//
// The provable terminal of the domain-extraction pipeline:
//   coverage = (resolved + risk_flagged) / behavior_bearing_total
// DoD is coverage == 1.0 (UNACCOUNTED == 0). Every behavior-bearing estate
// SymbolId is either RESOLVED (a rule annotation at/above the confidence
// threshold, with the in-graph requirement_validated bit agreeing) or
// RISK-flagged (below threshold / on the HITL queue) — never bare. The engine
// doubles as a gate: `computeCoverage(...).ok === false` (and the CLI exits
// non-zero) whenever coverage < 1.0, listing the unaccounted SymbolIds.
//
// Reads structure ONLY from an EstateClient (contract §Contract-2). Output
// validates against @wicked/domain-model-schema coverage.schema.json.

import { withConfig } from "./domain-config.mjs";

/**
 * @param {import("./estate-client.mjs").EstateClient} estate
 * @param {object} [partialConfig]  overrides for config.coverage.*
 * @returns {{ report: object, ok: boolean, unaccounted: string[] }}
 */
export function computeCoverage(estate, partialConfig = {}) {
  const config = withConfig(partialConfig);
  const cov = config.coverage;
  const behaviorKinds = new Set([...cov.behavior_kinds, ...cov.estate_behavior_kinds]);
  const activeEdge = new Set(cov.behavior_edge_kinds);
  const threshold = cov.resolve_threshold;

  const allNodes = estate.list_nodes();
  const total = allNodes.length;

  // Denominator: behavior-bearing nodes. A `module` with zero outgoing
  // active edges is a dead structural shell and is excluded (coverage.py:209).
  const behaviorNodes = allNodes.filter((n) => {
    if (!behaviorKinds.has(n.kind)) return false;
    if (n.kind === "module") {
      return (n.out_edges ?? []).some((e) => activeEdge.has(e));
    }
    return true;
  });

  const perAppMap = new Map();
  const unaccountedNodes = [];
  let resolved = 0, risk = 0;
  const settledConfidences = [];

  for (const n of behaviorNodes) {
    const state = classifyNode(n, threshold);
    const app = n.app ?? "default";
    const bucket = perAppMap.get(app) ?? { app, behavior_bearing: 0, resolved: 0, risk_flagged: 0, unaccounted: 0 };
    bucket.behavior_bearing += 1;

    if (state === "resolved") {
      resolved += 1; bucket.resolved += 1;
      if (typeof n.rule_confidence === "number") settledConfidences.push(n.rule_confidence);
    } else if (state === "risk") {
      risk += 1; bucket.risk_flagged += 1;
      if (typeof n.rule_confidence === "number") settledConfidences.push(n.rule_confidence);
    } else {
      bucket.unaccounted += 1;
      unaccountedNodes.push({
        symbol_id: n.symbol_id,
        name: n.name ?? null,
        kind: n.kind ?? null,
        file: n.file ?? "",
        app,
      });
    }
    perAppMap.set(app, bucket);
  }

  const behaviorBearing = behaviorNodes.length;
  const settled = resolved + risk;
  const coverage = behaviorBearing === 0 ? 1 : round4((resolved + risk) / behaviorBearing);
  const resolvedRate = settled === 0 ? 1 : round4(resolved / settled);
  const meanConfidence = settledConfidences.length === 0
    ? 0
    : round4(settledConfidences.reduce((a, b) => a + b, 0) / settledConfidences.length);

  const perApp = [...perAppMap.values()]
    .map((b) => ({ ...b, coverage: b.behavior_bearing === 0 ? 1 : round4((b.resolved + b.risk_flagged) / b.behavior_bearing) }))
    .sort((a, b) => a.app.localeCompare(b.app));

  unaccountedNodes.sort((a, b) => a.symbol_id.localeCompare(b.symbol_id));

  const report = {
    total,
    behavior_bearing: behaviorBearing,
    resolved,
    risk_flagged: risk,
    unaccounted: unaccountedNodes.length,
    coverage,
    resolved_rate: resolvedRate,
    mean_confidence: meanConfidence,
    resolve_threshold: threshold,
    per_app: perApp,
    unaccounted_nodes: unaccountedNodes,
  };

  return {
    report,
    ok: unaccountedNodes.length === 0,
    unaccounted: unaccountedNodes.map((n) => n.symbol_id),
  };
}

/**
 * Per-node coverage state (ports coverage.py:classify_node).
 *   resolved     — a rule at/above threshold AND the in-graph requirement_validated bit agrees.
 *   risk         — has a requirement/rule but below threshold or not validated (HITL queue).
 *   unaccounted  — bare: no requirement and no rule.
 */
export function classifyNode(n, threshold) {
  const hasRule = typeof n.rule_confidence === "number";
  const hasRequirement = Boolean(n.requirement);
  if (!hasRule && !hasRequirement) return "unaccounted";
  const confident = hasRule && n.rule_confidence >= threshold;
  if (confident && n.requirement_validated) return "resolved";
  return "risk";
}

function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}
