// @wicked/domain-model-schema — the shared spine for the wicked domain-brain effort.
// brain OWNS this versioned bundle; estate / garden / crew / wicked-testing import (or vendor) it.
// JS importers get { DOMAIN_MODEL_VERSION, schemas }. Schemas are loaded from disk
// (fs + import.meta.url) rather than JSON import attributes so this resolves on every
// Node >= 20 without experimental flags, on macOS/Linux/Windows alike.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(here, name), "utf8"));

/** Semver of the whole bundle (single source of truth: the VERSION file). */
export const DOMAIN_MODEL_VERSION = readFileSync(join(here, "VERSION"), "utf8").trim();

/**
 * The sibling schemas, keyed by their short name.
 *   domain-model / vocabulary / coverage  — the DESCRIPTIVE spine (facts mined FROM code).
 *   conformance-rules                      — the PRESCRIPTIVE sibling (rules applied TO code),
 *                                            on the same confidence + provenance spine.
 */
export const schemas = Object.freeze({
  "domain-model": load("domain-model.schema.json"),
  vocabulary: load("vocabulary.schema.json"),
  coverage: load("coverage.schema.json"),
  "conformance-rules": load("conformance-rules.schema.json"),
});

export default { DOMAIN_MODEL_VERSION, schemas };
