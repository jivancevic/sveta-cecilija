-- Two permissions join the vocabulary: `finance` and `editor` (#476, #500).
--
-- `finance` is money without buyers (revenue collected, refunds, the partner
-- receivable and its statements, plus the counts view of Statistika);
-- `editor` is Objave and FAQ in the Backoffice, which `tickets` loses.
--
-- On a fresh DB 00-base.sql already declares both values, so this is a no-op
-- there; on an existing DB it appends them. `ALTER TYPE ... ADD VALUE` must
-- live in its OWN file: it cannot share a transaction with any statement that
-- references the new value, and every db/schema file runs as one implicit
-- transaction (db/schema/README.md, docs/agents/db-bootstrap.md).
--
-- ORDERING: the filename sorts after migrate-permissions-1-schema.sql, which
-- creates the enum on a database that predates it. Idempotent.
ALTER TYPE public.enum_users_permissions ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE public.enum_users_permissions ADD VALUE IF NOT EXISTS 'editor';
