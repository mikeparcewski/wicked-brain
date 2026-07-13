// Vocabulary engine — a two-axis domain glossary miner (ports vocabulary.py).
//
// A frequency miner over estate node names. It PROPOSES terms; it never coins
// meaning. Every mined term carries TWO ORTHOGONAL AXES:
//   status       ∈ {proposed, confirmed}                    — is the TERM real?
//   verification ∈ {unverified, untrusted_verified,         — is the DEFINITION
//                    trusted_verified}                          proven vs code?
// Bootstrap emits status=proposed + verification=unverified + a BLANK
// definition. Promotion (proposed→confirmed) and definition-verification are
// downstream human/agent steps, never bootstrap-coined.
//
// Kind-sets are config-driven (contract §2.5). Reads names ONLY from an
// EstateClient. Output validates against vocabulary.schema.json.

import { withConfig } from "./domain-config.mjs";

/**
 * @param {import("./estate-client.mjs").EstateClient} estate
 * @param {object} [opts]
 * @param {object} [opts.config]   overrides for config.coverage.* kind-sets
 * @param {number} [opts.minFreq]  drop terms recurring fewer than this (default 1)
 * @param {string} [opts.db]       recorded in meta.bootstrap_run (provenance only)
 * @returns {{ vocabulary: object }}
 */
export function mineVocabulary(estate, opts = {}) {
  const config = withConfig(opts.config ?? {});
  const cov = config.coverage;
  const minFreq = opts.minFreq ?? 1;

  const typeKinds = new Set(cov.type_kinds);
  const actionKinds = new Set(cov.behavior_kinds);
  const structuralKinds = new Set(cov.structural_kinds);

  const nodes = estate.list_nodes();

  // canonical -> { term_type, freq, mined_from }
  const acc = new Map();
  const bump = (canonical, term_type, mined_from) => {
    if (!canonical) return;
    const key = `${term_type}::${canonical}`;
    const cur = acc.get(key) ?? { canonical, term_type, freq: 0, mined_from };
    cur.freq += 1;
    acc.set(key, cur);
  };

  for (const n of nodes) {
    if (!n.name) continue;
    if (typeKinds.has(n.kind)) {
      bump(n.name, "entity", "type_kinds");
    } else if (actionKinds.has(n.kind)) {
      bump(n.name, "action", "behavior_kinds");
    } else if (structuralKinds.has(n.kind)) {
      for (const token of tokenize(n.name)) {
        const type = isAbbreviation(token) ? "abbreviation" : "domain_concept";
        bump(token, type, "field-token");
      }
    }
  }

  const terms = [...acc.values()]
    .filter((t) => t.freq >= minFreq)
    .map((t) => ({
      canonical: t.canonical,
      term_type: t.term_type,
      definition: "",                    // BLANK until authored (contract §2.6)
      status: "proposed",                // axis 1: is the term real
      verification: "unverified",        // axis 2: is the meaning proven vs code
      freq: t.freq,
      mined_from: t.mined_from,
    }))
    .sort((a, b) => (b.freq - a.freq) || a.canonical.localeCompare(b.canonical));

  const confirmedCount = terms.filter((t) => t.status === "confirmed").length;
  const trustedCount = terms.filter((t) => t.verification === "trusted_verified").length;

  const vocabulary = {
    terms,
    meta: {
      vocabulary_version: "1.0",
      generated_by: "wicked-brain-vocabulary",
      bootstrap_run: {
        db: opts.db ?? "",
        ts: new Date(0).toISOString(),   // deterministic; callers may overwrite
        min_freq: minFreq,
      },
      term_count: terms.length,
      confirmed_count: confirmedCount,
      trusted_count: trustedCount,
    },
  };

  return { vocabulary };
}

/** Split a camelCase / snake_case / kebab identifier into lowercase word tokens. */
export function tokenize(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")   // camelCase boundary
    .replace(/[_\-.]+/g, " ")                  // snake / kebab / dotted
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)              // drop single chars / noise
    .map((t) => (isAbbreviation(t) ? t : t.toLowerCase()));
}

/** All-caps token of length ≤ 5 reads as an abbreviation (ID, SKU, ACH...). */
export function isAbbreviation(token) {
  return /^[A-Z0-9]{2,5}$/.test(token);
}
