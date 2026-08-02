-- Migration: add the shared read-only society-membership role. See ADR-0022.
--
-- `enum_users_role` is a real Postgres enum, and its CREATE TYPE in 00-base.sql
-- is wrapped in a `duplicate_object`-swallowing DO block — so adding the value
-- there alone only ever reaches a FRESH database. Existing databases need this
-- ALTER. Per ADR-0013 both are required: 00-base.sql for new databases, this
-- file for every database that already exists.
--
-- Filename sorts after migrate-roles-2-data.sql; bootstrap-db.mjs applies
-- migrate-*.sql in alphabetical order.
--
-- No data migration references 'member' (accounts are created by hand in
-- /admin), so unlike the superadmin/tehnika rename there is no sibling data
-- file — but the value still must not be USED in this same statement batch:
-- Postgres rejects `ALTER TYPE ... ADD VALUE` followed by use of that value in
-- the same transaction, and bootstrap sends each file as one query.
--
-- Idempotent.

ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'member';
