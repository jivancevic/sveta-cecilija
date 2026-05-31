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

## The CI guardrail

`src/lib/db-schema-safety.test.ts` scans every `.sql` file here and fails on
unguarded `UPDATE` / `DELETE` / `TRUNCATE`. If you legitimately need one of
those, give it a `WHERE`. If you can't, you don't want it in this directory.

## Background

PR #126 (2026-05-31) caught `migrate-qr-truncate.sql` ending with
`UPDATE shows SET online_sold=0, in_person_sold=0;` (no WHERE), running on
every deploy and silently zeroing the live counters. Pre-cutover it was
masked by test data; post-cutover it would have caused oversell on the first
redeploy after a real sale. PR #127 added the guardrail test in this
directory so the same class of bug fails at PR time, not in production.
