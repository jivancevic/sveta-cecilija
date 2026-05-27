-- Migration step 2/2: move existing rows onto the new role values.
-- Runs after migrate-roles-1-enum.sql (alphabetical order in bootstrap-db.mjs),
-- in a fresh implicit transaction so the new enum values are visible.
--
-- Only the developer account moves to superadmin; every other existing
-- `admin` row stays `admin` (its meaning shifts to "secretary tier").
-- door-staff → tehnika is unconditional.
--
-- The door-staff comparison uses ::text so the WHERE clause stays parseable
-- on DBs where Payload's `push:true` (dev) or a fresh DB has already rebuilt
-- the enum without the old 'door-staff' value. A direct `role = 'door-staff'`
-- errors with "invalid input value for enum enum_users_role: 'door-staff'"
-- because pg coerces the RHS literal to the column's enum type at parse time.
--
-- Idempotent.

UPDATE users
   SET role = 'superadmin'
 WHERE role = 'admin'
   AND email = 'josip.ivancevic00@gmail.com';

UPDATE users
   SET role = 'tehnika'
 WHERE role::text = 'door-staff';
