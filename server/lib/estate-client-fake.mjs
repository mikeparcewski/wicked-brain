// Fake EstateClient — the fixture seam that lets brain's engines and tests run
// disjoint from a live wicked-estate (contract §6 mock boundary).
//
// It returns canned `clusters --json --summary`, `nodes --json`, and annotation
// payloads, and RECORDS every write (annotate / set_requirement) so tests can
// assert the projection brain would make onto estate — without a subprocess.
//
// Usage:
//   const estate = makeFakeEstateClient({ clusters, nodes, annotations });
//   ...run an engine against `estate`...
//   estate.writes.annotate      // [{symbol_id, type, key, value, ...}, ...]
//   estate.writes.set_requirement

import { normalizeNode, appFromFile } from "./estate-client.mjs";

/**
 * @param {object} fixtures
 * @param {Array}  [fixtures.clusters]     Community objects (id/members/...).
 * @param {Array}  [fixtures.nodes]        Node rows (symbol_id/name/kind/file/out_edges/...).
 * @param {object} [fixtures.annotations]  Map symbol_id -> [Annotation].
 * @returns {import("./estate-client.mjs").EstateClient & { writes: object }}
 */
export function makeFakeEstateClient(fixtures = {}) {
  const nodes = (fixtures.nodes ?? []).map(normalizeNode);
  const clusters = (fixtures.clusters ?? []).map((c, i) => ({
    id: c.id ?? i,
    size: c.size ?? (c.members?.length ?? 0),
    members: c.members ?? [],
    label_candidates: c.label_candidates ?? [],
    dominant_files: c.dominant_files ?? [],
    modularity_contribution: c.modularity_contribution ?? 0,
  }));
  const annotations = fixtures.annotations ?? {};
  const writes = { annotate: [], set_requirement: [] };

  return {
    writes,

    read_clusters(params = {}) {
      const min = params.min_size ?? 0;
      return clusters.filter((c) => c.size >= min);
    },

    resolve(name, { file, kind } = {}) {
      return nodes
        .filter((n) => n.name === name)
        .filter((n) => (file ? n.file === file : true))
        .filter((n) => (kind ? n.kind === kind : true))
        .map((n) => n.symbol_id);
    },

    list_nodes({ kinds } = {}) {
      if (!kinds?.length) return nodes.slice();
      return nodes.filter((n) => kinds.includes(n.kind));
    },

    read_annotations(symbolId, type) {
      const list = annotations[symbolId] ?? [];
      return type ? list.filter((a) => a.type === type) : list.slice();
    },

    find_by_annotation(key, value) {
      const out = [];
      for (const [sym, list] of Object.entries(annotations)) {
        if (list.some((a) => a.key === key && (value == null || a.value === value))) {
          out.push(sym);
        }
      }
      return out;
    },

    source(symbolId) {
      const n = nodes.find((x) => x.symbol_id === symbolId);
      return n ? { symbol_id: symbolId, name: n.name, file: n.file, source: `// source of ${n.name}` } : null;
    },

    annotate(spec) {
      const rec = { replace: true, author: "brain", ...spec };
      writes.annotate.push(rec);
      return rec;
    },

    set_requirement(symbolId, requirement, validated) {
      const rec = { symbol_id: symbolId, requirement, validated };
      writes.set_requirement.push(rec);
      return rec;
    },
  };
}

/**
 * A small, self-consistent fixture graph: two clusters (payments, accounts),
 * a mix of behavior-bearing and structural nodes, some resolved / some bare —
 * enough to drive coverage, vocabulary, and domain-model engines end to end.
 */
export function sampleFixtures() {
  const nodes = [
    // payments cluster — behavior-bearing
    node("sym::pay::charge", "chargeCard", "function", "payments/charge.js", ["calls"], {
      requirement: "REQ-PAY-001", requirement_validated: true, rule_confidence: 0.91,
    }),
    node("sym::pay::refund", "issueRefund", "method", "payments/refund.js", ["calls", "uses"], {
      requirement: "REQ-PAY-002", requirement_validated: false, rule_confidence: 0.42, // below threshold -> risk
    }),
    node("sym::pay::settle", "settleBatch", "function", "payments/settle.js", ["calls"], {}), // bare -> unaccounted
    // accounts cluster — behavior-bearing
    node("sym::acct::open", "openAccount", "function", "accounts/open.js", ["calls"], {
      requirement: "REQ-ACCT-001", requirement_validated: true, rule_confidence: 0.88,
    }),
    node("sym::acct::Account", "Account", "class", "accounts/model.js", ["references"]),
    // structural leaves (not behavior-bearing)
    node("sym::acct::balance", "balance", "field", "accounts/model.js", []),
    node("sym::pay::amount", "amount", "field", "payments/charge.js", []),
  ];
  const clusters = [
    {
      id: 0, size: 3,
      members: ["sym::pay::charge", "sym::pay::refund", "sym::pay::settle"],
      label_candidates: ["sym::pay::charge", "sym::pay::refund"],
      dominant_files: ["payments/charge.js"],
      modularity_contribution: 0.12,
    },
    {
      id: 1, size: 2,
      members: ["sym::acct::open", "sym::acct::Account"],
      label_candidates: ["sym::acct::open"],
      dominant_files: ["accounts/open.js"],
      modularity_contribution: 0.09,
    },
  ];
  const annotations = {
    "sym::pay::charge": [
      { type: "business_rule", key: "business_rule", value: "A charge above the ceiling is declined", confidence: 0.91, provenance: "brain:extract@1.0.0" },
    ],
    "sym::acct::open": [
      { type: "business_rule", key: "business_rule", value: "An account requires a verified owner", confidence: 0.88, provenance: "brain:extract@1.0.0" },
    ],
  };
  return { nodes, clusters, annotations };
}

function node(symbol_id, name, kind, file, out_edges, extra = {}) {
  return { symbol_id, name, kind, file, app: appFromFile(file), out_edges, ...extra };
}
