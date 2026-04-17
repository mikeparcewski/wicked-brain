---
status: published
canonical_for: [RECIPE-ADD-MIGRATION]
references:
  - CONTRACT-SCHEMA
  - INV-MIGRATION-REQUIRED
owner: core
last_reviewed: 2026-04-17
---

# Recipe: add a schema migration

## Purpose

Evolve the SQLite schema without breaking existing brains. Every user has a
database file on disk; a shipping change that requires a manual rebuild is a
bug. Follow this recipe when adding columns, tables, or indexes.

## Steps

1. **Update `#initSchema()`.** In `server/lib/sqlite-search.mjs`, add the new
   columns/tables/indexes to the `CREATE TABLE IF NOT EXISTS` block. This is
   what fresh databases get.
2. **Append a numbered migration.** Inside `#migrate()`, add:

   ```js
   // Migration N: <short summary — used by the schema generator>
   if (currentVersion < N) {
     try { this.#db.prepare(`SELECT <new_col> FROM <table> LIMIT 0`).get(); } catch {
       this.#db.exec(`ALTER TABLE <table> ADD COLUMN <new_col> <TYPE>`);
     }
     // CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS for any new tables.
     currentVersion = N;
   }
   ```

   The `try/catch SELECT` guard makes the migration idempotent — re-runs on
   an already-upgraded DB are no-ops.
3. **Update the index/access layer.** Adjust `index()`, any SELECTs, and any
   helpers that need to read/write the new columns. Use JSON for array
   fields (see how `canonical_for` and `refs` are handled).
4. **Write the upgrade test.** In `server/test/canonical-ingest.test.mjs` or
   a sibling, build a v(N-1) database with `better-sqlite3` directly, open
   it via `SqliteSearch`, and assert that data survives + new behavior
   works. The migration-4 upgrade test is a concrete template.
5. **Regenerate the wiki.** Run `npm run gen:wiki`. Your migration will
   appear in `docs/wiki/contract-schema.md` with its summary and operations.

## Verification

- `cd server && node --test` — full suite green.
- `cd server && npm run gen:wiki:check` — exits 0 and includes the new
  migration in the ladder.
- Point the server at a pre-existing brain (one you used before the change)
  and confirm it starts without errors. `SELECT version FROM
  _schema_version` should show the new head version.

## Gotchas

- **`CREATE TABLE IF NOT EXISTS` does not add columns to existing tables.**
  You always need `ALTER TABLE` in the migration, even if you also update
  `#initSchema()`.
- **SQL reserved words.** `references` is reserved; `canonical_ownership`
  uses `refs` for this reason. Check before naming columns.
- **Index maintenance.** If you add a column that will be queried often, add
  a covering index in the same migration — it's cheaper than later.
- **Do not edit an already-shipped migration.** Add migration N+1 instead.
  A released migration is immutable — users have already run it.

## See also

- [`contract-schema.md`](contract-schema.md) — current head schema + ladder.
- [`invariants.md`](invariants.md) — `INV-MIGRATION-REQUIRED`.
