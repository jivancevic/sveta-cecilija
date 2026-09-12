-- Drop the legacy `users.role` column and its enum. See ADR-0023 (#398).
--
-- Permissions replaced roles in #393–#397: `can()` / `hasAny()` read
-- `users.permissions`, nothing reads `role`, and the column was already
-- optional and defaultless. It was retained for one release so a container
-- rollback to the pre-#393 image would still find intact data. That release
-- has shipped and been verified in production, so the column goes.
--
-- ORDERING: this file MUST sort last among `migrate-*.sql`, hence the `zz`.
-- bootstrap-db.mjs applies db/schema/*.sql in plain alphabetical order on every
-- restart, and two other files still read `role` while it exists:
--   migrate-permissions-2-data.sql  (the one-shot bundle backfill for a DB
--                                    upgraded straight from a pre-permissions
--                                    image — it must run BEFORE the drop, or
--                                    such a DB would end up with no permissions
--                                    at all and every login locked out)
--   migrate-username-1.sql          (the door account's username/email fixups)
-- Both are additionally wrapped in a column-existence guard so they are no-ops
-- once this file has run, and on a fresh database built from 00-base.sql (which
-- no longer declares the column or the enum at all).
--
-- `migrate-zz-…` sorts after `migrate-username-1.sql` ('z' > 'u') and before
-- `seed-*.sql` ('m' < 's'); the seeds do not touch `users`.
--
-- Idempotent: IF EXISTS on both statements. The DROP TYPE must follow the DROP
-- COLUMN — the column is the type's last dependent, and Postgres refuses to
-- drop a type still in use.

ALTER TABLE public.users DROP COLUMN IF EXISTS role;

DROP TYPE IF EXISTS public.enum_users_role;
