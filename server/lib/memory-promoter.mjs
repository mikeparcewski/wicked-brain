/**
 * Promotion policy for auto-memorizing wicked.fact.extracted bus events.
 *
 * Pure function — no I/O, no side effects. Returns either a memory descriptor
 * (frontmatter + content + safeName + contentHash) or a skip reason.
 *
 * @module lib/memory-promoter
 */

import { createHash } from "node:crypto";

const IMPORTANCE_BY_TYPE = { decision: 7, discovery: 4 };
const TTL_BY_TYPE = { decision: null, discovery: 14 };
const ALLOWED_TYPES = new Set(["decision", "discovery"]);
const MIN_CONTENT_LENGTH = 15;
const MAX_TAGS = 15;

/** Stable normalization for content hashing — collapses whitespace, lowercases. */
export function computeContentHash(content) {
  const normalized = String(content || "").trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

/** Slugify text for filenames: lowercase, alnum + dashes, collapsed, trimmed, capped. */
export function slugify(text, maxLen = 60) {
  const slug = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.slice(0, maxLen).replace(/-+$/g, "");
}

function tierFromImportance(importance) {
  if (importance >= 7) return "semantic";
  if (importance >= 4) return "episodic";
  return "working";
}

/**
 * Apply the auto-memorize promotion policy to a bus event.
 * @param {object} event
 * @returns {{memory: object|null, skip: boolean, reason?: string}}
 */
export function promoteFact(event) {
  if (!event || event.event_type !== "wicked.fact.extracted") {
    return { memory: null, skip: true, reason: "wrong event_type" };
  }
  const payload = event.payload || {};
  const type = payload.type;
  if (!ALLOWED_TYPES.has(type)) {
    return { memory: null, skip: true, reason: `type ${type} not auto-promoted` };
  }
  const content = typeof payload.content === "string" ? payload.content : null;
  if (!content) {
    return { memory: null, skip: true, reason: "missing payload.content" };
  }
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    return { memory: null, skip: true, reason: "content too short" };
  }

  const importance = IMPORTANCE_BY_TYPE[type];
  const tier = tierFromImportance(importance);
  const ttlDays = TTL_BY_TYPE[type];
  const contentHash = computeContentHash(trimmed);

  const sourceDomain = event.domain || "unknown";
  const source = `bus:${sourceDomain}`;

  const emittedAt = event.emitted_at || Date.now();
  const sessionOrigin = payload.session_id || new Date(emittedAt).toISOString();

  const entityList = Array.isArray(payload.entities) ? payload.entities.map(String) : [];
  // Tags = entities + the type label, deduped, capped at MAX_TAGS
  const tagSet = new Set();
  for (const e of entityList) {
    if (e) tagSet.add(e);
    if (tagSet.size >= MAX_TAGS) break;
  }
  if (tagSet.size < MAX_TAGS) tagSet.add(type);
  const contains = Array.from(tagSet).slice(0, MAX_TAGS);

  const frontmatter = {
    type,
    tier,
    confidence: 0.3,
    importance,
    content_hash: contentHash,
    source,
    ttl_days: ttlDays,
    session_origin: sessionOrigin,
    contains,
    entities: { systems: entityList, people: [] },
    indexed_at: new Date().toISOString(),
  };

  const slugBase = slugify(trimmed.slice(0, 60));
  const safeName = `${slugBase || "memory"}-${contentHash.slice(0, 8)}.md`;

  return {
    memory: { frontmatter, content: trimmed, safeName, contentHash },
    skip: false,
  };
}
