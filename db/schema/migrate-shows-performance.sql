-- Shows becomes the record of EVERY performance (#405, ADR-0024 phase 2).
--
-- The expand half of expand-contract: `kind` + `is_public` classify a row, a
-- non-public performance carries a free-text `location` / `client` instead of a
-- venue, and every row carries the phase-3 roster fields (army thresholds and a
-- voditelj note). `venue` loses NOT NULL and its column default so a non-public
-- performance can hold NULL there.
--
-- ORDERING: no cross-table reference, so the only requirement is that this file
-- sorts after `00-base.sql` (it does — `0` < `m`). On a fresh DB 00-base.sql
-- already creates every object below and this file is a pure no-op; on an
-- existing prod/staging DB it applies the deltas. Every statement is guarded and
-- safe to re-run on every restart, per db/schema/README.md.
--
-- Types deliberately mirror what Payload `push` produces from the collection
-- config (the drift gate compares against it): numeric for number fields,
-- character varying for text/textarea.

-- 1. The kind enum. `CREATE TYPE` (not `ALTER TYPE … ADD VALUE`), so it may
--    safely share a transaction with the ADD COLUMN that references its values.
DO $$ BEGIN
CREATE TYPE public.enum_shows_kind AS ENUM (
    'redovna',
    'dmc',
    'gulliver',
    'koncert',
    'ostalo'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Classification. Existing rows backfill through the defaults: every show in
--    the table today is a public redovna.
ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS kind public.enum_shows_kind
    DEFAULT 'redovna'::public.enum_shows_kind NOT NULL;

ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true NOT NULL;

-- 3. Where a NON-public performance happens, and for whom. Free text: no venue,
--    no capacity, no lookup table.
ALTER TABLE shows ADD COLUMN IF NOT EXISTS location character varying;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS client   character varying;

-- 4. Roster fields (phase 3 reads them; nothing does yet).
ALTER TABLE shows ADD COLUMN IF NOT EXISTS threshold_crni numeric DEFAULT 8 NOT NULL;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS threshold_bili numeric DEFAULT 8 NOT NULL;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS voditelj_note  character varying;

-- 5. `venue` becomes optional. Both statements are idempotent by definition
--    (dropping an absent NOT NULL / DEFAULT is a no-op, not an error), so no
--    guard is needed. The application never writes NULL to a public row: the
--    Shows beforeValidate hook enforces "public ⇒ venue".
ALTER TABLE shows ALTER COLUMN venue DROP NOT NULL;
ALTER TABLE shows ALTER COLUMN venue DROP DEFAULT;
