# `db/schema/` — app-managed schema, runs every restart

`scripts/bootstrap-db.mjs` reads every `.sql` file here in alphabetical order
and applies each one on every `npm start` (prod) and `npm run dev` (local). Each
file runs as one implicit Postgres transaction.

## The rule

**Every statement must be safe to re-run on a populated DB.** This is the only
contract for files in this directory.

Safe:
- `CREATE TABLE IF NOT EXISTS …`
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`
- `ALTER TYPE … ADD VALUE IF NOT EXISTS …` (in its own file — can't share a
  transaction with statements that reference the new value)
- `INSERT INTO … SELECT … WHERE NOT EXISTS (SELECT 1 FROM …)` (seed pattern)
- `UPDATE … WHERE …` (idempotent on second run because the WHERE no longer
  matches, or because re-applying the same value is a no-op)
- `DELETE FROM … WHERE …` (same logic)

Not safe — **do not commit these here**:
- `TRUNCATE …` — wipes the table on every restart
- `UPDATE … SET col = 0` with no `WHERE` — zeros every row on every restart
- `DELETE FROM …` with no `WHERE` — same
- Any statement whose effect depends on it running exactly once

## One-shot migrations

If you need to wipe a table or reset a counter once, **do it manually in the
admin DB terminal**. Don't commit it as a `.sql` file here. The git history of
this directory should be schema evolution, not one-time data fixes.

`scripts/bootstrap-db.mjs` has no concept of "this one ran, skip it" — every
file runs every time. There's no migrations table to track applied state, by
design.

## `00-base.sql` — the generated full baseline

`00-base.sql` (sorts first, runs first) is the **complete Payload schema** —
every table, enum, sequence, constraint and index that Payload `push` would
create from the collection configs, made idempotent (`CREATE … IF NOT EXISTS`,
enum/constraint creates wrapped in `DO … EXCEPTION WHEN duplicate_object`).

It exists because **prod and staging never run Payload `push`** (Payload
disables it in production), so `db/schema/` is the *only* thing that builds a
fresh DB — a DR rebuild, the `postgres`→`sveta_cecilija` rename, a clean-slate
cutover. Before `00-base.sql`, the base tables (`users`, `shows`, `payload_*`)
only came from `src/instrumentation.ts` at server start, which runs *after*
`bootstrap-db.mjs`, so a fresh DB crashed on `app.sql`'s `ALTER TABLE users …`
(`relation "users" does not exist`). With `00-base.sql`, `bootstrap-db.mjs`
builds the entire schema before the server starts. See ADR-0013.

`app.sql` (and `migrate-*.sql`) remain the **incremental, idempotent
migrations** that bring an *already-existing, older* DB up to date — on a fresh
DB they are all no-ops on top of `00-base.sql`; on an old prod DB they add the
columns/constraints `00-base`'s `CREATE … IF NOT EXISTS` can't (the table
already exists). Keep adding new changes to `app.sql`, then regenerate
`00-base.sql` (below). **Do not hand-edit `00-base.sql`.**

### Regenerating `00-base.sql`

Whenever a Payload collection changes (a field, a `select` option, a new
collection), regenerate the baseline so it still equals Payload's schema:

1. Boot the app against an empty throwaway DB so Payload `push` builds the
   schema (dev path — `next dev` directly, *not* `npm run dev`, which would also
   run `bootstrap-db.mjs`), then hit `/admin` once to trigger init + push.
2. `pg_dump --schema-only --no-owner --no-privileges` that DB.
3. Pipe through the transformer:
   `node scripts/sqldump-to-idempotent.mjs < dump.sql > db/schema/00-base.sql`
4. Verify locally: apply `db/schema/*.sql` to a fresh DB and diff against the
   push schema with `node scripts/schema-diff.mjs <push-dump> <bootstrap-dump>`.

## The CI guardrails

`src/lib/db-schema-safety.test.ts` scans every `.sql` file here and fails on
unguarded `UPDATE` / `DELETE` / `TRUNCATE`. If you legitimately need one of
those, give it a `WHERE`. If you can't, you don't want it in this directory.

`.github/workflows/schema-drift.yml` (the **drift gate**, ADR-0013) boots
Payload `push` into one throwaway DB and `bootstrap-db.mjs` into another, dumps
both, and fails the PR if `db/schema/` no longer reproduces every object Payload
requires. "Changed a collection but forgot to regenerate `00-base.sql`" becomes
a red build instead of a latent fresh-DB / cutover landmine.

## Background

PR #126 (2026-05-31) caught `migrate-qr-truncate.sql` ending with
`UPDATE shows SET online_sold=0, in_person_sold=0;` (no WHERE), running on
every deploy and silently zeroing the live counters. Pre-cutover it was
masked by test data; post-cutover it would have caused oversell on the first
redeploy after a real sale. PR #127 added the guardrail test in this
directory so the same class of bug fails at PR time, not in production.
