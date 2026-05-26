-- Migration step 2/2: move existing rows onto the new role values.
-- Runs after migrate-roles-1-enum.sql (alphabetical order in bootstrap-db.mjs),
-- in a fresh implicit transaction so the new enum values are visible.
--
-- Only the developer account moves to superadmin; every other existing
-- `admin` row stays `admin` (its meaning shifts to "secretary tier").
-- door-staff → tehnika is unconditional.
--
-- Idempotent.

UPDATE users
   SET role = 'superadmin'
 WHERE role = 'admin'
   AND email = 'josip.ivancevic00@gmail.com';

UPDATE users
   SET role = 'tehnika'
 WHERE role = 'door-staff';
