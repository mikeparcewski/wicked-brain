// Config-driven miner kind-sets (contract §2.5, the genericization mandate).
//
// HARD INVARIANT #6: "no kind is hardcoded as a domain signal — the config is
// the single source of which kinds mean what." The engines read every kind-set
// from `config.coverage.*`; the values below are the generic modern
// (JS/TS/Rust) defaults, NOT hardcoded engine constants. A COBOL/mainframe
// estate would supply its own kinds (e.g. estate_behavior_kinds:
// ["db2_table","cics_program","step"]).

export const DEFAULT_CONFIG = Object.freeze({
  coverage: Object.freeze({
    // Behavior-bearing predicate — domain actions/verbs (the coverage numerator/denominator source).
    behavior_kinds: Object.freeze(["module", "function", "method"]),
    // Domain entities/nouns.
    type_kinds: Object.freeze(["class", "interface", "struct", "trait", "enum", "record"]),
    // Field-level nouns/abbreviations (structural leaves — NOT behavior-bearing).
    structural_kinds: Object.freeze(["field", "variable"]),
    // Estate object-kinds naming entities verbatim (mainframe/IaC only). Empty for a modern repo.
    estate_behavior_kinds: Object.freeze([]),
    // Edge kinds that make a node "active": a `module` with zero of these is excluded from the
    // denominator. Lower-cased estate EdgeKind names (normalizeNode lower-cases estate's PascalCase);
    // includes `imports` so a module that depends on others counts as live (a module's out-edges are
    // Imports/Contains, not Calls), plus call/reference/instantiate for functions/methods.
    behavior_edge_kinds: Object.freeze(["calls", "references", "imports", "instantiates"]),
    // Confidence at/above which a rule annotation counts as RESOLVED.
    resolve_threshold: 0.75,
  }),
});

/** Shallow-merge a partial config over the defaults (coverage.* only for v1). */
export function withConfig(partial = {}) {
  const cov = { ...DEFAULT_CONFIG.coverage, ...(partial.coverage ?? {}) };
  return { ...DEFAULT_CONFIG, ...partial, coverage: cov };
}
