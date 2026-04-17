---
status: published
canonical_for: [RECIPE-ADD-ACTION]
references:
  - CONTRACT-API
  - INV-ESM-ONLY
  - INV-NO-BUILD-STEP
owner: core
last_reviewed: 2026-04-17
---

# Recipe: add a `POST /api` action

## Purpose

Add a new action name that the HTTP dispatcher will route to a handler.
Every user-visible surface of the server (skills, other servers, federated
brains) reaches the brain through one of these. If you are not adding an
action, you probably should not be editing the server handler.

## Steps

1. **Write or locate the implementation.** If the logic belongs on
   `SqliteSearch`, add a public method in `server/lib/sqlite-search.mjs`. If
   it needs the language server, add a method on `LspClient` in
   `server/lib/lsp-client.mjs`. If it genuinely fits neither, add a small
   pure module in `server/lib/` and import it from `wicked-brain-server.mjs`.
2. **Add the action entry.** Open `server/bin/wicked-brain-server.mjs` and
   add a line to the `const actions = { ... }` object. Pattern:

   ```js
   my_new_action: (p) => db.myNewMethod(p),
   ```

   Async handlers get `async (p) => await ...`. Emit a bus event where it
   makes sense (mirror the nearby `search` / `index` lines).
3. **Write tests.** Unit test the underlying method in the lib it lives in.
   A method without a test is not mergeable — the migration and search
   suites are good models.
4. **Regenerate the wiki.** Run `npm run gen:wiki` in `server/`. Confirm
   your action appears in `docs/wiki/contract-api.md` with the expected
   implementation link.
5. **Add a consumer.** If a skill or other client is the reason for the
   action, update its SKILL.md to call the new endpoint. Skills live in
   `skills/wicked-brain-*/SKILL.md`.

## Verification

- `cd server && node --test` — full suite green.
- `cd server && npm run gen:wiki:check` — exits 0.
- Hit the running server:

  ```bash
  curl -s -X POST http://localhost:4242/api \
    -H "Content-Type: application/json" \
    -d '{"action":"my_new_action","params":{}}' | jq
  ```

## Gotchas

- Quoted action names like `"lsp-health"` are valid — use when the identifier
  isn't a bare word.
- Do not bypass `SqliteSearch` for ad-hoc SQL. The class owns schema, and
  ad-hoc queries break `INV-MIGRATION-REQUIRED`.
- No build step — `INV-NO-BUILD-STEP`. Don't reach for TypeScript or a
  bundler.

## See also

- [`contract-api.md`](contract-api.md) — canonical list of existing actions.
- [`invariants.md`](invariants.md) — `INV-ESM-ONLY`, `INV-NO-BUILD-STEP`.
