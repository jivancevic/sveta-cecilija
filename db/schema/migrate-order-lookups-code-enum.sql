-- Widen the order-lookups mode enum with 'code' (#245). Door volunteers can now
-- search the active show by order code, not just email/name.
--
-- On a fresh DB the value is already in the CREATE TYPE in 00-base.sql/app.sql;
-- on an existing DB those CREATE statements are skipped (duplicate_object), so
-- this ALTER is what actually adds the value there. Must live in its own file:
-- bootstrap-db.mjs sends each .sql as one implicit transaction, and Postgres
-- rejects using a freshly-added enum value in the same transaction. No data
-- migration references it, so a sibling step-2 file isn't needed.
--
-- Idempotent.

ALTER TYPE enum_order_lookups_mode ADD VALUE IF NOT EXISTS 'code';
