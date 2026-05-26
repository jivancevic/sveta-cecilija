-- Migration: rename role strings to the three-tier model. See ADR-0006.
--
-- Order matters. Payload's drizzle schema for `users.role` is generated from
-- the field's select options (now superadmin/admin/tehnika). On boot in dev,
-- Payload's `push: true` rewrites the Postgres enum to match — but the ALTER
-- TABLE ... USING cast fails if any row still contains a value that's not in
-- the new enum, OR if any UPDATE below references a value not yet added.
--
-- So we (a) widen the existing enum to a superset, (b) move data onto values
-- that exist in both old and new shapes, then let Payload's push (or, in prod,
-- the natural state after this script) take it from here. Idempotent — every
-- statement is a no-op on re-run.

-- (a) Make the new role strings legal in the existing enum so the UPDATEs
-- below don't blow up with `invalid input value for enum`. Postgres requires
-- ADD VALUE statements to be standalone (no DO block), but each one has
-- IF NOT EXISTS so re-runs are safe.
ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'superadmin';
ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'tehnika';

-- (b) Selective data migration: only the developer account moves to
-- superadmin; every other existing `admin` row stays `admin` (its meaning
-- shifts to "secretary tier"). door-staff → tehnika is unconditional.
UPDATE users
   SET role = 'superadmin'
 WHERE role = 'admin'
   AND email = 'josip.ivancevic00@gmail.com';

UPDATE users
   SET role = 'tehnika'
 WHERE role = 'door-staff';
