// Conformance fixture — a small, self-consistent, VALID conformance-rules
// document (pattern + policy rules) that the two garden enforcement issues can
// build disjoint against a mock, without a live ingest source or wicked-estate.
//
// Every rule is conformant: numeric confidence in [0,1], provenance with
// source_kinds, id prefix agreeing with rule_type (PAT-*/POL-*), and (where a
// binding is shown) a symbol_ref that is an estate SymbolId REFERENCE — never a
// copy of the symbol's code. It exercises: both rule_types, all four severities,
// every targeting facet (language/layer/framework), a broadly-scoped rule (no
// targets = wildcard), and a symbol-bound rule.

/**
 * @returns {object} a valid conformance-rules.schema.json document.
 */
export function conformanceFixture() {
  return {
    metadata: { schema_version: "1.0.0", source: "acme/architecture-guild" },
    rules: [
      {
        id: "PAT-001",
        rule_type: "pattern",
        statement: "The repository layer must not import the web layer.",
        severity: "error",
        targets: { layer: "repository" },
        confidence: 0.95,
        provenance: { source: "acme/architecture-guild", ref: "wiki/layering.md#repository", source_kinds: ["doc"] },
      },
      {
        id: "PAT-002",
        rule_type: "pattern",
        statement: "Domain modules must not depend on any web framework package.",
        severity: "warn",
        targets: { layer: "domain", language: "python" },
        confidence: 0.8,
        provenance: { source: "acme/architecture-guild", ref: "wiki/layering.md#domain", source_kinds: ["doc"] },
      },
      {
        id: "PAT-003",
        rule_type: "pattern",
        statement: "HTTP handlers must delegate persistence to a repository, never open a DB connection inline.",
        severity: "error",
        targets: { layer: "web", framework: "express", language: "typescript" },
        symbol_ref: "sym::web::handlers::createOrder",
        confidence: 0.9,
        provenance: { source: "acme/architecture-guild", ref: "sym::web::handlers::createOrder", source_kinds: ["code-body"] },
      },
      {
        id: "POL-001",
        rule_type: "policy",
        statement: "No secret literals (API keys, passwords, tokens) may appear in source.",
        severity: "critical",
        confidence: 0.99,
        provenance: { source: "acme/security", ref: "policies/secrets.md", source_kinds: ["doc"] },
      },
      {
        id: "POL-002",
        rule_type: "policy",
        statement: "Every HTTP handler must enforce authentication before touching a resource.",
        severity: "error",
        targets: { layer: "web", framework: "express" },
        confidence: 0.85,
        provenance: { source: "acme/security", ref: "policies/authn.md#handlers", source_kinds: ["doc"] },
      },
      {
        id: "POL-003",
        rule_type: "policy",
        statement: "Log lines must not include PII fields (email, SSN, full name).",
        severity: "info",
        targets: { language: "python" },
        confidence: 0.7,
        provenance: { source: "acme/security", ref: "policies/logging.md#pii", source_kinds: ["doc", "comment"] },
      },
    ],
  };
}
