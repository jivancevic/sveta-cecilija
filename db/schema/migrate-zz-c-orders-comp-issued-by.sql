-- Who issued a comp order: an admin, or the moreškant themselves (#434,
-- ADR-0019 × ADR-0024 phase 4). Glossary: CONTEXT.md → *Moreškant comp*.
--
-- A self-issued comp is still a comp order (channel='comp', total=0, attributed
-- to a Member) — what this column adds is the ONE fact the cap and the /admin
-- reporting need: whether the four-ticket per-performance limit applies to it.
-- Admin comps for the same member deliberately do NOT count against a dancer's
-- four (#430, story 52), and the only way to tell the two apart afterwards is
-- to record it at issue time.
--
-- The column is NULLABLE and has NO DEFAULT, both deliberately:
--
--   * every order that predates this file carries NULL, so a NOT NULL would
--     fail on the very first restart against the live table;
--   * a default of 'admin' would label every FUTURE online and partner order
--     "Admin" in the /admin column, which is a small lie about a Stripe
--     purchase — and `ADD COLUMN … DEFAULT` would have stamped it on every
--     existing row too (Postgres 11+ fills them). Both comp routes write the
--     value explicitly instead (`buildCompIssueDeps`).
--
-- Readers treat NULL exactly as 'admin' — only the literal 'self' is a
-- self-issued comp — so the backfill below is bookkeeping, not a correctness
-- requirement.
--
-- ORDERING: the `-c-` is a SORT KEY, not a word, the `migrate-zz-b-lineups.sql`
-- convention. bootstrap-db.mjs applies these files in plain filename order with
-- no dependency resolution (db/schema/README.md), and
-- `migrate-zz-drop-users-role.sql` must remain the LAST migrate-* file (#398,
-- asserted by src/lib/db-schema-safety.test.ts): 'attendance' < 'b-lineups' <
-- 'c-orders-comp-issued-by' < 'drop-users-role'. It touches only `orders`,
-- which 00-base.sql creates, so it needs no wall on the left.
--
-- On a fresh DB 00-base.sql has already created the type and the column, so
-- every statement here is a no-op; on the existing prod DB it adds them. All
-- statements are guarded and safe to re-run on every restart.

-- 1. The enum Payload push emits for the select field.
DO $$ BEGIN
CREATE TYPE public.enum_orders_comp_issued_by AS ENUM (
    'admin',
    'self'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. The column itself, with no default (see the header).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS comp_issued_by public.enum_orders_comp_issued_by;

-- 3. Drop a default if an earlier revision of this file left one behind. A
--    no-op on a column that has none, so it is safe on every restart.
ALTER TABLE orders
  ALTER COLUMN comp_issued_by DROP DEFAULT;

-- 4. Backfill the comp orders that predate the column. Every comp that already
--    exists was issued by an admin — /app could not issue one until this ticket.
--    Idempotent: the WHERE stops matching once the rows are written, and
--    re-applying the same value would be a no-op anyway. Paid online and
--    partner orders are deliberately left NULL: the field is about comps.
UPDATE orders
   SET comp_issued_by = 'admin'
 WHERE channel = 'comp'
   AND comp_issued_by IS NULL;
