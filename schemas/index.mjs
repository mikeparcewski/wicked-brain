// @wicked/domain-model-schema — the shared spine for the wicked domain-brain effort.
// brain OWNS this versioned bundle; estate / garden / crew import (or vendor) it.
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

/** The three sibling schemas, keyed by their short name. */
export const schemas = Object.freeze({
  "domain-model": load("domain-model.schema.json"),
  vocabulary: load("vocabulary.schema.json"),
  coverage: load("coverage.schema.json"),
});

export default { DOMAIN_MODEL_VERSION, schemas };
