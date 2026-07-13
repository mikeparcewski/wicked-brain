// Pluggable compliance-framework registry — the SEAM for mapping a policy rule's
// { framework, control_id } onto an external control catalog (SOC2 / PCI-DSS / HIPAA).
//
// Owner direction: wire the ability to LOAD and EXECUTE a framework behind a fixed
// interface, ship a config-driven NO-OP default now, and let real frameworks drop in
// later WITHOUT touching the store or downstream enforcement. The seam is tested once;
// every drop-in is then covered by the same contract (test-cost stays flat).
//
// Mirrors the source-connector adapter pattern in conformance-ingest.mjs (fs shipped,
// Confluence/SharePoint stubbed) — same idea, a different axis (control catalogs).
//
// ComplianceFramework interface:
//   {
//     name: string,
//     resolve(control_id) -> {
//       framework,       // the framework's own name
//       control_id,      // echoed
//       known: boolean,  // does this framework recognize the control?
//       title: string|null,  // human title of the control, when the framework knows it
//     }
//   }

/**
 * The shipped DEFAULT framework: a config-driven no-op. It never fails and, by default,
 * treats every control as `known` (a passthrough), so a rule with a compliance binding
 * LOADS + EXECUTES today with zero real framework wired. Pass
 * `{ controls: { "<id>": "<title>" } }` (or an array of ids) to turn it into a testable
 * fixture — then unknown controls resolve `known:false`.
 * @param {{name?: string, controls?: (object|string[]|null)}} [config]
 */
export function noopFramework({ name = "noop", controls = null } = {}) {
  const lookup =
    controls == null ? null
      : Array.isArray(controls) ? new Map(controls.map((id) => [id, null]))
        : new Map(Object.entries(controls));
  return {
    name,
    resolve(control_id) {
      const known = lookup == null ? true : lookup.has(control_id);
      const title = lookup && known ? (lookup.get(control_id) ?? null) : null;
      return { framework: name, control_id, known, title };
    },
  };
}

/** name -> (config) => ComplianceFramework. Real frameworks register here as drop-ins. */
const REGISTRY = new Map();

/** Register a real framework factory by name (a later drop-in, e.g. "soc2"). */
export function registerFramework(name, factory) {
  if (typeof factory !== "function") {
    throw new Error(`registerFramework(${name}): factory must be a function`);
  }
  REGISTRY.set(name, factory);
}

/** True when a real (non-no-op) framework is registered under `name`. */
export function hasFramework(name) {
  return REGISTRY.has(name);
}

/**
 * LOAD a framework by name: a registered drop-in if present, else the config-driven
 * no-op default (which still EXECUTES — it just doesn't validate against a real catalog).
 * @param {string} name
 * @param {object} [config]  framework-specific config; for the no-op, `{ controls }`.
 * @returns {{name: string, resolve: (id: string) => object}}
 */
export function loadFramework(name, config = {}) {
  const factory = REGISTRY.get(name);
  return factory ? factory(config) : noopFramework({ name, ...config });
}

/**
 * EXECUTE a rule's compliance binding: load its framework and resolve its control_id.
 * Returns null when the rule carries no `compliance` binding. `config` is keyed by
 * framework name (`{ soc2: {...} }`) so different frameworks get different config.
 * @param {object} rule  a conformance rule (may or may not have `.compliance`)
 * @param {object} [config]  `{ [frameworkName]: frameworkConfig }`
 * @returns {object|null}  the resolve() result, or null when unbound
 */
export function executeCompliance(rule, config = {}) {
  const c = rule?.compliance;
  if (!c) return null;
  const fw = loadFramework(c.framework, config[c.framework] ?? {});
  return fw.resolve(c.control_id);
}
