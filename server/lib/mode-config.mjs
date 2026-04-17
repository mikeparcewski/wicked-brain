import fs from "node:fs/promises";
import path from "node:path";

const MODE_FILE_REL = ".wicked-brain/mode.json";
const SCHEMA_VERSION = 1;
const VALID_MODES = new Set(["code", "content", "mixed", "unknown"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a mode.json body. Returns { ok, errors } — does not throw.
 * Kept in lockstep with mode.schema.json. The schema is the canonical
 * documentation; this is the runtime enforcement.
 */
export function validateMode(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["body is not an object"] };
  }
  if (body.schema_version !== SCHEMA_VERSION) {
    errors.push(`schema_version must be ${SCHEMA_VERSION}, got ${body.schema_version}`);
  }
  if (!VALID_MODES.has(body.mode)) {
    errors.push(`mode must be one of ${[...VALID_MODES].join(", ")}, got ${body.mode}`);
  }
  if (typeof body.wiki_root !== "string" || body.wiki_root.length === 0) {
    errors.push("wiki_root must be a non-empty string");
  }
  if (body.content_root !== null && typeof body.content_root !== "string") {
    errors.push("content_root must be string or null");
  }
  if (typeof body.detected_at !== "string" || !DATE_RE.test(body.detected_at)) {
    errors.push("detected_at must be YYYY-MM-DD");
  }
  if (typeof body.override !== "boolean") {
    errors.push("override must be boolean");
  }
  if (body.score !== undefined) {
    if (!body.score || typeof body.score !== "object") errors.push("score must be an object");
    else {
      if (typeof body.score.code !== "number") errors.push("score.code must be a number");
      if (typeof body.score.content !== "number") errors.push("score.content must be a number");
    }
  }
  if (body.reasons !== undefined && !Array.isArray(body.reasons)) {
    errors.push("reasons must be an array");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Read .wicked-brain/mode.json for a repo. Returns null if missing.
 * Throws on malformed JSON so callers can surface the issue rather than
 * silently re-detecting over a corrupt file.
 */
export async function readModeFile(repoRoot) {
  const p = path.join(repoRoot, MODE_FILE_REL);
  let raw;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(raw);
}

/**
 * Write .wicked-brain/mode.json for a repo.
 *
 * Honors override:true on any existing file — will not overwrite a
 * human-managed mode.json. Detection-managed writes pass through.
 *
 * Returns { written: boolean, reason?: string, path: string }.
 */
export async function writeModeFile(repoRoot, detection, { override = false } = {}) {
  const p = path.join(repoRoot, MODE_FILE_REL);
  const existing = await readModeFile(repoRoot);
  if (existing && existing.override === true && override === false) {
    return { written: false, reason: "override:true present — not overwriting", path: p };
  }

  const now = new Date().toISOString().slice(0, 10);
  const body = {
    schema_version: SCHEMA_VERSION,
    mode: detection.mode,
    wiki_root: detection.wiki_root,
    content_root: detection.content_root ?? null,
    detected_at: now,
    override,
    score: detection.score,
    reasons: detection.reasons,
  };

  const { ok, errors } = validateMode(body);
  if (!ok) {
    throw new Error(`invalid mode.json body: ${errors.join("; ")}`);
  }

  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(body, null, 2) + "\n", "utf8");
  return { written: true, path: p };
}

/**
 * Compare an existing mode.json against a fresh detection.
 * Returns { changed: boolean, fields: string[] } — callers decide whether
 * to warn the user before writing.
 */
export function diffMode(existing, detection) {
  if (!existing) return { changed: true, fields: ["(no prior mode.json)"] };
  const fields = [];
  if (existing.mode !== detection.mode) fields.push("mode");
  if (existing.wiki_root !== detection.wiki_root) fields.push("wiki_root");
  if ((existing.content_root ?? null) !== (detection.content_root ?? null)) {
    fields.push("content_root");
  }
  return { changed: fields.length > 0, fields };
}

export const MODE_FILE_PATH = MODE_FILE_REL;
