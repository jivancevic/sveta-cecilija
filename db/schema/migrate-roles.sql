-- Migration: rename role strings to the three-tier model.
-- See ADR-0006. Idempotent: each UPDATE matches only un-migrated rows, so
-- re-runs (bootstrap-db.mjs runs on every deploy) are no-ops.
--
-- Selective: the developer account becomes superadmin; every other existing
-- `admin` row stays `admin` (its meaning shifts to "secretary tier"). The
-- `door-staff` -> `tehnika` rename is unconditional.

UPDATE users
   SET role = 'superadmin'
 WHERE role = 'admin'
   AND email = 'josip.ivancevic00@gmail.com';

UPDATE users
   SET role = 'tehnika'
 WHERE role = 'door-staff';
