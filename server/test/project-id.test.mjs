import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectId,
  slugifyId,
  baseName,
  resolvePerProjectBrain,
} from "../lib/project-id.mjs";

// ---- projectId / slugifyId: the canonical slug convention (kebab-case) ----

test("underscores fold to hyphens (the #56 command_iq split)", () => {
  assert.equal(projectId("/Users/me/Projects/command_iq"), "command-iq");
  // The two divergent ids collapse to the SAME canonical slug.
  assert.equal(projectId("command_iq"), projectId("command-iq"));
});

test("spaces fold to a single hyphen and collapse runs", () => {
  assert.equal(slugifyId("My Cool Project"), "my-cool-project");
  assert.equal(slugifyId("a   b"), "a-b");
  assert.equal(slugifyId("a___b"), "a-b");
  assert.equal(slugifyId("mixed _ - space"), "mixed-space");
});

test("case is folded to lowercase", () => {
  assert.equal(slugifyId("WickedBrain"), "wickedbrain");
  assert.equal(slugifyId("Command_IQ"), "command-iq");
  assert.equal(projectId("/x/y/Wicked-Estate"), "wicked-estate");
});

test("leading/trailing separators are trimmed", () => {
  assert.equal(slugifyId("_foo_"), "foo");
  assert.equal(slugifyId("--foo--"), "foo");
  assert.equal(slugifyId(".hidden."), "hidden");
});

test("unicode folds toward ASCII via NFKD", () => {
  assert.equal(slugifyId("café"), "cafe");
  assert.equal(slugifyId("naïve-project"), "naive-project");
  assert.equal(slugifyId("Zürich_Repo"), "zurich-repo");
  // Compatibility ligatures decompose under NFKD (ﬁ → fi).
  assert.equal(slugifyId("ﬁnance"), "finance");
});

test("names that fold away to nothing get a deterministic, collision-free slug", () => {
  const a = slugifyId("日本語");
  const b = slugifyId("한국어");
  assert.ok(a.length > 0, "empty-fold name must still yield a non-empty slug");
  assert.ok(a.startsWith("brain-"));
  assert.equal(a, slugifyId("日本語"), "must be deterministic");
  assert.notEqual(a, b, "distinct non-latin names must not collapse together");
});

test("empty / nullish input is handled", () => {
  assert.equal(projectId(""), slugifyId(""));
  assert.equal(projectId(undefined), slugifyId(""));
  assert.ok(slugifyId("").startsWith("brain-"));
});

// ---- baseName: cross-platform trailing-segment extraction ----

test("baseName handles both separators and trailing slashes", () => {
  assert.equal(baseName("/Users/me/Projects/command_iq"), "command_iq");
  assert.equal(baseName("C:\\Users\\me\\command_iq"), "command_iq");
  assert.equal(baseName("/Users/me/proj/"), "proj");
  assert.equal(baseName("bare-name"), "bare-name");
});

// ---- path-resolution and the init skill agree on the slug ----
// The init SKILL.md documents: "Lowercase the result and replace
// non-alphanumeric characters with hyphens." Reproduce that rule independently
// and assert projectId() produces the identical slug, so the resolver and the
// skill can never drift again (the root cause of #56).

function skillDocumentedSlug(cwdBasename) {
  return cwdBasename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

test("projectId agrees with the init skill's documented kebab rule", () => {
  for (const name of [
    "command_iq",
    "wicked-brain",
    "My_Repo",
    "some.dotted.name",
    "trailing_",
    "UPPER_CASE_THING",
  ]) {
    assert.equal(
      projectId("/somewhere/" + name),
      skillDocumentedSlug(name),
      `projectId disagreed with the skill rule for "${name}"`,
    );
  }
});

// ---- resolvePerProjectBrain: fragmentation-safe resolution ----

const ROOT = "/home/u/.wicked-brain/projects";
const join = (a, b) => `${a}/${b}`;

function resolveWith(cwd, stores, indexed = []) {
  const storeSet = new Set(stores.map((s) => join(ROOT, s)));
  const indexSet = new Set(indexed.map((s) => join(ROOT, s)));
  return resolvePerProjectBrain({
    cwd,
    projectsRoot: ROOT,
    storeExists: (dir) => storeSet.has(dir),
    hasIndex: (dir) => indexSet.has(dir),
    joinPath: join,
  });
}

test("fresh repo → canonical dir, no warning", () => {
  const r = resolveWith("/p/command_iq", []);
  assert.equal(r.path, join(ROOT, "command-iq"));
  assert.equal(r.collision, false);
  assert.equal(r.warning, null);
});

test("only canonical store exists → canonical dir, no warning", () => {
  const r = resolveWith("/p/command_iq", ["command-iq"], ["command-iq"]);
  assert.equal(r.path, join(ROOT, "command-iq"));
  assert.equal(r.warning, null);
});

test("only legacy raw-basename store exists → serve legacy + warn to migrate", () => {
  const r = resolveWith("/p/command_iq", ["command_iq"], ["command_iq"]);
  assert.equal(r.path, join(ROOT, "command_iq"), "must not strand the existing brain");
  assert.equal(r.collision, false);
  assert.match(r.warning, /legacy id "command_iq"/);
  assert.match(r.warning, /canonical id is "command-iq"/);
});

test("SPLIT: both exist, canonical degraded (no index), legacy has index → serve legacy + warn (the #56 case)", () => {
  const r = resolveWith(
    "/p/command_iq",
    ["command-iq", "command_iq"], // both initialized
    ["command_iq"],               // only the legacy store has a .brain.db
  );
  assert.equal(r.path, join(ROOT, "command_iq"), "must serve the populated store, not the empty one");
  assert.equal(r.collision, true);
  assert.match(r.warning, /split brain/);
  assert.match(r.warning, /it has an index; canonical is empty/);
});

test("SPLIT: both exist and canonical is populated → prefer canonical", () => {
  const r = resolveWith(
    "/p/command_iq",
    ["command-iq", "command_iq"],
    ["command-iq", "command_iq"], // both populated → tie-break to canonical
  );
  assert.equal(r.path, join(ROOT, "command-iq"));
  assert.equal(r.collision, true);
  assert.match(r.warning, /split brain/);
});

test("no divergence when the basename is already canonical (no false collision)", () => {
  const r = resolveWith("/p/wicked-brain", ["wicked-brain"], ["wicked-brain"]);
  assert.equal(r.legacyId, r.canonicalId);
  assert.equal(r.collision, false);
  assert.equal(r.warning, null);
  assert.equal(r.path, join(ROOT, "wicked-brain"));
});

// ---- #1: case-insensitive FS must not report a case-only variant as a split ----
// On macOS APFS / Windows, cwd basename `MyRepo` slugs to canonical `myrepo`, and
// both `projects/MyRepo` and `projects/myrepo` are the SAME physical dir. The two
// `storeExists` probes both hit that one dir; without the `sameDir` guard the
// resolver would see "both stores exist" and fabricate a split. Inject the probes
// so the test is deterministic on ANY host filesystem.

test("case-only basename variant on a case-insensitive FS is NOT a split (#1 regression guard)", () => {
  const canonicalDir = join(ROOT, "myrepo");
  const legacyDir = join(ROOT, "MyRepo");
  const r = resolvePerProjectBrain({
    cwd: "/p/MyRepo",
    projectsRoot: ROOT,
    // Case-insensitive FS: every case variant probes the one physical dir.
    storeExists: (dir) => dir === canonicalDir || dir === legacyDir,
    hasIndex: (dir) => dir === canonicalDir || dir === legacyDir,
    // realpath collapses both variants to the same underlying directory.
    sameDir: () => true,
    joinPath: join,
  });
  assert.equal(r.canonicalId, "myrepo");
  assert.equal(r.legacyId, "MyRepo");
  assert.equal(r.collision, false, "one physical dir reached by two names is not a split");
  assert.equal(r.warning, null);
  assert.equal(r.path, canonicalDir, "serve the canonical path for the single underlying store");
});

test("control: without the sameDir guard the same inputs WOULD read as a split", () => {
  // Proves the guard (sameDir) is what suppresses the false positive — with
  // sameDir defaulting to never-same, two case variants both 'exist' → split.
  const canonicalDir = join(ROOT, "myrepo");
  const legacyDir = join(ROOT, "MyRepo");
  const r = resolvePerProjectBrain({
    cwd: "/p/MyRepo",
    projectsRoot: ROOT,
    storeExists: (dir) => dir === canonicalDir || dir === legacyDir,
    hasIndex: (dir) => dir === canonicalDir || dir === legacyDir,
    joinPath: join, // no sameDir → defaults to () => false
  });
  assert.equal(r.collision, true);
});

// ---- #2: both stores degraded (no index) → serve the one that holds content ----
// If neither store has a built `.brain.db` but one holds memory/*.md, the resolver
// must serve the content-bearing store, not silently pick the empty canonical.

test("both stores lack an index but legacy holds content → serve the content-bearing store", () => {
  const canonicalDir = join(ROOT, "command-iq");
  const legacyDir = join(ROOT, "command_iq");
  const r = resolvePerProjectBrain({
    cwd: "/p/command_iq",
    projectsRoot: ROOT,
    storeExists: (dir) => dir === canonicalDir || dir === legacyDir,
    hasIndex: () => false,                       // neither has a built .brain.db
    hasContent: (dir) => dir === legacyDir,      // only the legacy store has notes
    sameDir: () => false,                        // genuinely distinct dirs
    joinPath: join,
  });
  assert.equal(r.path, legacyDir, "must serve the store that actually holds content");
  assert.equal(r.collision, true);
  assert.match(r.warning, /split brain/);
  assert.match(r.warning, /it holds content; canonical is empty/);
});

test("both stores empty (no index, no content) → tie-break to canonical", () => {
  const canonicalDir = join(ROOT, "command-iq");
  const legacyDir = join(ROOT, "command_iq");
  const r = resolvePerProjectBrain({
    cwd: "/p/command_iq",
    projectsRoot: ROOT,
    storeExists: (dir) => dir === canonicalDir || dir === legacyDir,
    hasIndex: () => false,
    hasContent: () => false,
    sameDir: () => false,
    joinPath: join,
  });
  assert.equal(r.path, canonicalDir, "genuinely-empty both → prefer canonical");
  assert.equal(r.collision, true);
});

test("both stores lack an index but canonical holds content → keep canonical", () => {
  const canonicalDir = join(ROOT, "command-iq");
  const legacyDir = join(ROOT, "command_iq");
  const r = resolvePerProjectBrain({
    cwd: "/p/command_iq",
    projectsRoot: ROOT,
    storeExists: (dir) => dir === canonicalDir || dir === legacyDir,
    hasIndex: () => false,
    hasContent: (dir) => dir === canonicalDir,
    sameDir: () => false,
    joinPath: join,
  });
  assert.equal(r.path, canonicalDir);
  assert.equal(r.collision, true);
});
