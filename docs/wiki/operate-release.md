---
status: published
canonical_for: [RECIPE-RELEASE]
references:
  - RECIPE-RUN-TESTS
  - INV-CROSS-PLATFORM
owner: core
last_reviewed: 2026-04-17
---

# Operate: cutting a release

## Purpose

Ship a new version of `wicked-brain-server` to npm and GitHub Packages.
Releases are fully automated — your job is to push a tag.

## Steps

1. **Confirm main is green.** CI on `main` must be passing. Run `npm test`
   locally as a sanity check.
2. **Push your changes to `main`.** Merge via PR or push directly if that
   is the project's convention. Do not commit a version bump in
   `package.json` — the release pipeline sets the version from the tag.
3. **Tag and push.**

   ```bash
   git tag vX.Y.Z
   git push --tags
   ```

4. **Watch `.github/workflows/release.yml`.** The workflow triggers on
   `v*` tags and runs the full matrix (ubuntu, macos, windows). A failure
   aborts the publish.
5. **Confirm publish.** The workflow publishes to npm with provenance, to
   GitHub Packages, and creates a GitHub Release with auto-generated notes.

## Verification

- `npm view wicked-brain-server version` → the tag's version.
- GitHub Releases page lists the new release.
- A smoke install in a fresh directory works:

  ```bash
  npx wicked-brain-server@latest --version
  ```

## Gotchas

- **Never run `npm publish` locally.** Version-from-tag is the only supported
  path.
- **Tags are immutable.** Re-pushing a tag does not re-run the workflow and
  the registry rejects re-publish of the same version. If a release is
  broken, cut vX.Y.(Z+1).
- **Cross-platform CI is load-bearing.** Do not merge a PR that makes the
  matrix pass by skipping Windows or Linux — that violates
  `INV-CROSS-PLATFORM`.

## See also

- [`invariants.md`](invariants.md) — `INV-CROSS-PLATFORM`.
- [`operate-testing.md`](operate-testing.md) — what `npm test` covers.
- [`../../CLAUDE.md`](../../CLAUDE.md) — releasing section (links here).
