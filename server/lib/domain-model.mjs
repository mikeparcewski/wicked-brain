// Domain-model engine — assembles domains → requirements from estate clusters
// and the rule annotations bound onto their members (contract §Contract-1 §2).
//
// A domain is DERIVED FROM an estate Louvain community, not hand-partitioned:
// the engine reads `clusters --json --summary`, groups each community's
// behavior-bearing members that carry ≥1 business_rule annotation into
// requirements, and records the community index as advisory `cluster_id`
// provenance. Every domain fact stores a SymbolId REFERENCE
// (requirement.legacy_components, rule.provenance.ref) — never a copy of the
// symbol's code/file/line (contract §3, invariant #5).
//
// The emitted document validates against @wicked/domain-model-schema
// domain-model.schema.json@1.0.0. Structure is read ONLY from an EstateClient.

import { withConfig } from "./domain-config.mjs";
import { appFromFile } from "./estate-client.mjs";

/**
 * @param {import("./estate-client.mjs").EstateClient} estate
 * @param {object} [opts]
 * @param {object} [opts.config]           kind-set overrides (config.coverage.*)
 * @param {string} [opts.source]           repo/service the model was mined from
 * @param {"functional"|"structural"} [opts.migrationMode]  default "functional"
 * @param {number} [opts.minClusterSize]   passed to read_clusters (default 2)
 * @returns {{ document: object }}
 */
export function buildDomainModel(estate, opts = {}) {
  const config = withConfig(opts.config ?? {});
  const cov = config.coverage;
  const typeKinds = new Set(cov.type_kinds);
  const behaviorKinds = new Set([...cov.behavior_kinds, ...cov.estate_behavior_kinds]);
  const structuralKinds = new Set(cov.structural_kinds);

  const clusters = estate.read_clusters({ min_size: opts.minClusterSize ?? 2 });
  const nodesById = new Map(estate.list_nodes().map((n) => [n.symbol_id, n]));

  const domains = {};
  const usedSlugs = new Set();

  for (const cluster of clusters) {
    const members = cluster.members.map((id) => nodesById.get(id)).filter(Boolean);
    if (members.length === 0) continue;

    const slug = uniqueSlug(clusterSlug(cluster, members), usedSlugs);
    usedSlugs.add(slug);

    // Entities: type-kind members. Their fields: structural members in the same file.
    const entities = {};
    for (const m of members.filter((n) => typeKinds.has(n.kind))) {
      const fields = members
        .filter((f) => structuralKinds.has(f.kind) && f.file === m.file)
        .map((f) => ({ name: f.name ?? "", type: "unknown", description: `Field ${f.name} of ${m.name}.` }));
      entities[m.name] = {
        description: `Entity ${m.name}, derived from estate cluster ${cluster.id}.`,
        fields,
      };
    }

    // Requirements: behavior-bearing members that carry ≥1 business_rule annotation.
    const requirements = {};
    let reqCounter = 0;
    for (const m of members.filter((n) => behaviorKinds.has(n.kind))) {
      const ruleAnns = estate
        .read_annotations(m.symbol_id, "business_rule")
        // Drop confidence-less annotations — evidence must not be fabricated. A node with no
        // VALID rules stays a genuine coverage hole rather than being laundered into a
        // "resolved" requirement (which would defeat INV-2 and the coverage gate).
        .filter((a) => typeof a.confidence === "number");
      if (ruleAnns.length === 0) continue; // no valid rules ⇒ not a requirement (a coverage hole, not a placeholder)

      reqCounter += 1;
      const reqKey = m.requirement || `REQ-${slug.toUpperCase()}-${pad3(reqCounter)}`;
      requirements[reqKey] = {
        title: humanize(m.name),
        description: `Behavior of ${m.name} (${m.kind}) in ${m.file}.`,
        legacy_components: [m.symbol_id], // SymbolId REFERENCE, not a copy
        data_access: [],                  // PHASE-1: not mined
        dependencies: [],                 // PHASE-1: not mined
        business_rules: ruleAnns.map((a, i) => toRule(a, i + 1, m.symbol_id, opts.source)),
        validations: [],
        error_paths: [],
        status: "active",
        disposition: "keep",
      };
    }

    domains[slug] = {
      description: humanize(slug),
      cluster_id: cluster.id,
      requirements,
      entities,
    };
  }

  const document = {
    metadata: {
      schema_version: "1.0.0",
      migration_mode: opts.migrationMode ?? "functional",
      ...(opts.source ? { source: opts.source } : {}),
    },
    domains,
  };

  return { document };
}

/** Map an estate business_rule annotation onto a schema Rule object. */
function toRule(ann, ordinal, symbolId, source) {
  if (typeof ann.confidence !== "number") {
    // Never fabricate confidence: a confidence-less annotation is malformed evidence, filtered
    // upstream (it stays a coverage hole). Fail loud if one slips through rather than laundering it.
    throw new Error(`toRule: business_rule on ${symbolId} has non-numeric confidence — filter upstream, don't fabricate`);
  }
  return {
    id: `RULE-${pad3(ordinal)}`,
    statement: ann.value ?? "",
    confidence: ann.confidence,
    provenance: {
      source: source || provenanceSource(ann.provenance) || "estate",
      ref: symbolId,                    // the estate SymbolId reference
      source_kinds: ["code-body"],      // grounded in a graph node's body
    },
  };
}

/** Derive a domain slug from a cluster's label/dominant-file signal. */
function clusterSlug(cluster, members) {
  if (cluster.dominant_files?.length) {
    const app = appFromFile(cluster.dominant_files[0]);
    if (app && app !== "default") return slugify(app);
  }
  const byApp = members.map((m) => m.app).find(Boolean);
  if (byApp && byApp !== "default") return slugify(byApp);
  return `domain-${cluster.id}`;
}

function uniqueSlug(base, used) {
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "domain";
}

function humanize(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function provenanceSource(p) {
  return typeof p === "string" && p.trim() ? p.trim() : null;
}

function pad3(n) {
  return String(n).padStart(3, "0");
}
