-- Migration step 1/2: widen the role enum. See ADR-0006.
--
-- Must run in its own transaction. Postgres rejects `ALTER TYPE ... ADD VALUE`
-- followed by use of that new value inside the same transaction with
-- "unsafe use of new value". bootstrap-db.mjs sends each .sql file as one
-- client.query() call (= one implicit transaction), so the UPDATE statements
-- that reference 'superadmin' / 'tehnika' live in a sibling file
-- (migrate-roles-2-data.sql) that runs immediately after, with a commit
-- boundary between them.
--
-- Idempotent.

ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'superadmin';
ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'tehnika';
-- Partner sales channel (ADR-0008). Value only; partner accounts + scoped
-- access land in #143. No data migration references it, so it stays here.
ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'partner';
