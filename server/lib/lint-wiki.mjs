/**
 * Wiki linter.
 *
 * Pure functions that run rules against a built canonical registry plus the
 * raw file contents of each page. I/O (walking the disk, stat'ing referenced
 * paths) lives in the CLI wrapper — this module is testable with synthetic
 * inputs.
 *
 * Rule levels are "error" (fails the lint) or "warn" (informational, but
 * `--strict` mode promotes to error).
 */

const DEFAULT_LONG_PAGE_LINES = 80;
const DEFAULT_LONG_PAGE_MIN_REFS = 3;
// Pages that own multiple canonical IDs are foundational (e.g. invariants,
// glossary) — their line count reflects the content they own, not a
// pointer-page that grew. Skip the restating heuristic for them.
const CANONICAL_ANCHOR_THRESHOLD = 2;

/**
 * Run every rule and return a flat list of findings.
 *
 * Inputs:
 *   registry      — output of buildRegistry
 *   pages         — [{ path, data, body, lineCount }]
 *   knownPaths    — Set of repo-relative paths that exist (for ref resolution)
 *
 * Returns: [{ rule, level, page, message, extra }]
 */
export function runLintRules({ registry, pages, knownPaths = new Set(), options = {} }) {
  const findings = [];
  findings.push(...ruleDuplicateCanonicalFor(registry));
  findings.push(...ruleBrokenReference(registry, knownPaths));
  findings.push(...ruleLongPageLowRefs(pages, options));
  findings.push(...ruleMissingCanonicalPurpose(pages));
  return findings;
}

/**
 * ERROR if any canonical_for ID is claimed by two or more pages.
 */
export function ruleDuplicateCanonicalFor(registry) {
  const out = [];
  for (const dup of registry.duplicates) {
    out.push({
      rule: "duplicate_canonical_for",
      level: "error",
      page: dup.paths[0],
      message: `canonical_for: ${dup.id} claimed by multiple pages`,
      extra: { id: dup.id, paths: dup.paths },
    });
  }
  return out;
}

/**
 * ERROR if a `references` entry doesn't resolve to a canonical ID or a
 * known path. External URLs (http/https) are skipped.
 */
export function ruleBrokenReference(registry, knownPaths) {
  const out = [];
  const canonicalIds = new Set(registry.byId.keys());
  for (const page of registry.pages) {
    for (const ref of page.references) {
      if (/^https?:/i.test(ref)) continue;
      if (isResolvable(ref, canonicalIds, knownPaths)) continue;
      out.push({
        rule: "broken_reference",
        level: "error",
        page: page.path,
        message: `unresolved reference: ${ref}`,
        extra: { ref },
      });
    }
  }
  return out;
}

/**
 * WARN if a non-generated page has a body over N lines and fewer than M
 * outbound references. Heuristic for "probably restating instead of linking."
 */
export function ruleLongPageLowRefs(pages, options = {}) {
  const linesThreshold = options.longPageLines ?? DEFAULT_LONG_PAGE_LINES;
  const minRefs = options.longPageMinRefs ?? DEFAULT_LONG_PAGE_MIN_REFS;
  const out = [];
  for (const p of pages) {
    if (p.data?.generated === true) continue;
    const canonicalCount = normalizeList(p.data?.canonical_for).length;
    if (canonicalCount >= CANONICAL_ANCHOR_THRESHOLD) continue;
    const refCount = normalizeList(p.data?.references).length;
    if (p.lineCount > linesThreshold && refCount < minRefs) {
      out.push({
        rule: "long_page_low_refs",
        level: "warn",
        page: p.path,
        message: `${p.lineCount} lines with only ${refCount} references — probably restating`,
        extra: { lines: p.lineCount, refs: refCount },
      });
    }
  }
  return out;
}

/**
 * WARN if a page declares neither canonical_for nor references. Such a page
 * owns nothing and cites nothing — it's probably an orphan or a restated copy.
 */
export function ruleMissingCanonicalPurpose(pages) {
  const out = [];
  for (const p of pages) {
    if (p.data?.generated === true) continue;
    const canon = normalizeList(p.data?.canonical_for);
    const refs = normalizeList(p.data?.references);
    if (canon.length === 0 && refs.length === 0) {
      out.push({
        rule: "missing_canonical_purpose",
        level: "warn",
        page: p.path,
        message: "page has no canonical_for and no references",
      });
    }
  }
  return out;
}

/**
 * Exit-code mapping. Non-strict: any error → 1. Strict: any finding → 1.
 */
export function lintExitCode(findings, { strict = false } = {}) {
  if (findings.length === 0) return 0;
  if (strict) return 1;
  return findings.some((f) => f.level === "error") ? 1 : 0;
}

/**
 * Human-readable text report.
 */
export function formatFindings(findings) {
  if (findings.length === 0) return "wiki lint: clean.";
  const lines = [];
  for (const f of findings) {
    lines.push(`[${f.level}] ${f.page}: ${f.rule} — ${f.message}`);
  }
  return lines.join("\n");
}

// --- internals ---

function normalizeList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function isResolvable(ref, canonicalIds, knownPaths) {
  if (canonicalIds.has(ref)) return true;
  const hashIdx = ref.indexOf("#");
  if (hashIdx >= 0) {
    const anchor = ref.slice(hashIdx + 1);
    if (canonicalIds.has(anchor)) return true;
    const pathPart = ref.slice(0, hashIdx);
    if (pathPart.length > 0 && knownPaths.has(pathPart)) return true;
  }
  if (knownPaths.has(ref)) return true;
  return false;
}
