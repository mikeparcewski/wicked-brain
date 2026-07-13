// EstateClient — brain's ONLY window onto code structure.
//
// Contract (DES-DOMAIN-BRAIN-CONTRACT.md §Contract-2 §5): brain deleted its
// parallel code graph and now reads structure exclusively from wicked-estate
// over the estate CLI shell-out. The MCP surface cannot back brain (it drops
// cluster members and has no annotation writer), so the CLI is the v1 transport.
//
// This module defines the fixed interface (the "mock boundary" from the
// contract) and one concrete implementation, `EstateCliClient`, that shells out
// to the `wicked-estate` binary. A fixture implementation lives in
// `estate-client-fake.mjs` — the two are swappable so brain's engines and their
// tests run disjoint from a live estate.
//
// Interface (every method keyed on the interned SymbolId string, never a name):
//   read_clusters(params)                 -> [Community]
//   resolve(name, {file, kind})           -> [symbol_id]
//   list_nodes({kinds})                   -> [Node]
//   read_annotations(symbol_id, type?)    -> [Annotation]
//   find_by_annotation(key, value?)       -> [symbol_id]
//   source(symbol_id)                     -> { symbol_id, source, ... } | null
//   annotate({symbol_id,type,key,value,confidence,provenance,replace})  (write)
//   set_requirement(symbol_id, requirement, validated)                  (write)
//
// Community = { id, size, members:[symbol_id], label_candidates,
//               dominant_files, modularity_contribution }
// Node      = { symbol_id, name, kind, file, app, out_edges:[edgeKind],
//               requirement?, requirement_validated?, rule_confidence? }

import { execFileSync } from "node:child_process";

/**
 * @typedef {object} EstateClient
 * @property {(params?: object) => Array} read_clusters
 * @property {(name: string, opts?: object) => string[]} resolve
 * @property {(opts?: object) => Array} list_nodes
 * @property {(symbolId: string, type?: string) => Array} read_annotations
 * @property {(key: string, value?: string) => string[]} find_by_annotation
 * @property {(symbolId: string) => (object|null)} source
 * @property {(spec: object) => object} annotate
 * @property {(symbolId: string, requirement: string, validated: boolean) => object} set_requirement
 */

/** Default estate binary; override via constructor for tests or a pinned path. */
const DEFAULT_BIN = "wicked-estate";

/**
 * CLI-backed EstateClient. PHASE-1: the read/write shapes below track the estate
 * v0.13.1 CLI contract (Contract 2 §2-§3). Parsing is best-effort against the
 * documented `--json` shapes; the fixture client is the fully-exercised path in
 * tests, this is the production seam.
 */
export class EstateCliClient {
  #bin;
  #db;
  #timeout;

  constructor({ bin = DEFAULT_BIN, db, timeout = 60000 } = {}) {
    this.#bin = bin;
    this.#db = db;
    this.#timeout = timeout;
  }

  #run(args) {
    const full = this.#db ? [...args, "--db", this.#db] : args;
    return execFileSync(this.#bin, full, {
      encoding: "utf-8",
      timeout: this.#timeout,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  #json(args) {
    const out = this.#run(args).trim();
    return out ? JSON.parse(out) : null;
  }

  read_clusters(params = {}) {
    const args = ["clusters"];
    if (params.min_size != null) args.push(String(params.min_size));
    args.push("--json", "--summary");
    if (params.resolution != null) args.push("--resolution", String(params.resolution));
    if (params.hierarchical) args.push("--hierarchical");
    if (params.package_bias != null) args.push("--package-bias", String(params.package_bias));
    const clusters = this.#json(args) ?? [];
    return clusters.map((c, i) => ({
      id: c.id ?? i,
      size: c.size ?? (c.members?.length ?? 0),
      members: c.members ?? [],
      label_candidates: c.label_candidates ?? [],
      dominant_files: c.dominant_files ?? [],
      modularity_contribution: c.modularity_contribution ?? 0,
    }));
  }

  resolve(name, { file, kind } = {}) {
    const args = ["nodes", "--json"];
    if (kind) args.push("--kind", kind);
    const nodes = this.#json(args) ?? [];
    return nodes
      .filter((n) => n.name === name)
      .filter((n) => (file ? n.file === file : true))
      .filter((n) => (kind ? n.kind === kind : true))
      .map((n) => n.symbol_id)
      .filter(Boolean);
  }

  list_nodes({ kinds } = {}) {
    // `--semantics` enriches each node with requirement/requirement_validated/rule_confidence/
    // out_edges (from estate's semantics + annotation + edge stores) — the fields the coverage
    // classifier needs. Without it every node would classify as unaccounted (coverage never 1.0).
    const args = ["nodes", "--json", "--semantics"];
    if (kinds?.length === 1) args.push("--kind", kinds[0]);
    let nodes = this.#json(args) ?? [];
    if (kinds?.length > 1) nodes = nodes.filter((n) => kinds.includes(n.kind));
    return nodes.map(normalizeNode);
  }

  read_annotations(symbolId, type) {
    const args = ["annotations", "--symbol", symbolId, "--json"];
    if (type) args.push("--type", type);
    const payload = this.#json(args);
    return payload?.annotations ?? [];
  }

  find_by_annotation(key, value) {
    const spec = value != null ? `${key}=${value}` : key;
    const nodes = this.#json(["nodes", "--annotated-with", spec, "--json"]) ?? [];
    return nodes.map((n) => n.symbol_id).filter(Boolean);
  }

  source(symbolId) {
    return this.#json(["source", symbolId, "--json"]);
  }

  annotate({ symbol_id, type, key, value, confidence, provenance, author = "brain", replace = true }) {
    const args = ["annotate", "--symbol", symbol_id, "--key", key, "--value", value];
    if (type) args.push("--type", type);
    if (confidence != null) args.push("--confidence", String(confidence));
    if (provenance) args.push("--provenance", provenance);
    if (author) args.push("--author", author);
    if (replace) args.push("--replace");
    this.#run(args);
    return { symbol_id, type, key, value, replace };
  }

  set_requirement(symbolId, requirement, validated) {
    const args = ["semantics", symbolId, "--requirement", requirement,
      "--validated", validated ? "true" : "false"];
    this.#run(args);
    return { symbol_id: symbolId, requirement, validated };
  }
}

/** Coerce a raw estate `nodes --json` row into the interface Node shape.
 *
 * estate emits `kind` and edge kinds as PascalCase enum Debug names (`Function`,
 * `Module`, `Calls`, `Imports`, …); brain's config kind-sets are lowercase. Lower-case
 * them HERE — the estate→interface boundary — so a single adapter reconciles the whole
 * vocabulary and the fixture client (already lowercase) passes through unchanged. */
export function normalizeNode(n) {
  const lc = (s) => (s == null ? null : String(s).toLowerCase());
  return {
    symbol_id: n.symbol_id,
    name: n.name ?? null,
    kind: lc(n.kind),
    file: n.file ?? "",
    app: n.app ?? appFromFile(n.file ?? ""),
    out_edges: (n.out_edges ?? []).map((e) => String(e).toLowerCase()),
    requirement: n.requirement ?? null,
    requirement_validated: n.requirement_validated ?? false,
    rule_confidence: n.rule_confidence ?? null,
  };
}

/** Derive a coarse app label from a file path's leading segment. */
export function appFromFile(file) {
  if (!file) return "default";
  const norm = file.replace(/\\/g, "/").replace(/^\.?\//, "");
  const seg = norm.split("/")[0];
  return seg || "default";
}
