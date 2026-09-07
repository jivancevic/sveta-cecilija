-- Migration step 2/2: give every existing user the permission bundle that
-- reproduces the role they held before ADR-0023. See ADR-0023 (#394).
--
-- Runs after migrate-permissions-1-schema.sql (alphabetical order in
-- bootstrap-db.mjs), in a fresh implicit transaction so the enum created there
-- is committed and usable here.
--
-- Bundles (ADR-0023, unchanged behaviour for every account):
--   superadmin -> all nine
--   admin      -> tickets, refunds, door
--   tehnika    -> door        + shared
--   partner    -> partner
--   member     -> season_stats + shared
--
-- Re-runnable on EVERY restart, which bootstrap-db.mjs guarantees it will be:
-- BOTH statements are guarded on "this user's permission set is still empty",
-- so together they fire exactly once per user, on the first bootstrap after
-- the permissions deploy. Afterwards the set is never empty again, so once a
-- `users` holder edits a set or clears the `shared` flag in /admin, this file
-- never overwrites either again. The one exception is a set emptied
-- completely, which is refilled — the safe direction, because the field is
-- required, so a truly empty set is a bug rather than a choice.
--
-- #398 DROPPED the legacy `users.role` column (migrate-zz-drop-users-role.sql,
-- which sorts last). This file is kept for the one path that still needs it: a
-- database upgraded straight from a pre-permissions image, whose `users` table
-- still carries `role` when bootstrap runs. Everything is therefore wrapped in
-- a column-existence guard and executed dynamically (EXECUTE), so the
-- statements are never even parsed on a database without the column — a fresh
-- DB built from 00-base.sql, or any DB on which the drop has already run.
--
-- `role::text` is used throughout so the file stays parseable on a database
-- whose enum no longer carries one of these labels.
--
-- Idempotent.

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
  ) THEN
    RETURN;
  END IF;

  -- The two shared logins (ADR-0022 for `member`, the door device for
  -- `tehnika`). Runs BEFORE the INSERT below and carries the SAME guard, so it
  -- fires exactly once — while the permission set is still empty. After the
  -- INSERT the set is never empty again, so a later edit by a `users` holder
  -- (including turning `shared` off) sticks across restarts.
  EXECUTE $sql$
    UPDATE public.users u
       SET shared = true
     WHERE u.shared IS DISTINCT FROM true
       AND u.role::text IN ('tehnika', 'member')
       AND NOT EXISTS (
         SELECT 1 FROM public.users_permissions p WHERE p.parent_id = u.id
       )
  $sql$;

  EXECUTE $sql$
    INSERT INTO public.users_permissions ("order", parent_id, value)
    SELECT b.ord, u.id, b.perm::public.enum_users_permissions
      FROM public.users u
      CROSS JOIN LATERAL (
        SELECT perm, ord
          FROM unnest(
            CASE u.role::text
              WHEN 'superadmin' THEN ARRAY['users','tickets','refunds','door','partner','season_stats','moreska','moreskant','dev']
              WHEN 'admin'      THEN ARRAY['tickets','refunds','door']
              WHEN 'tehnika'    THEN ARRAY['door']
              WHEN 'partner'    THEN ARRAY['partner']
              WHEN 'member'     THEN ARRAY['season_stats']
              ELSE ARRAY[]::text[]
            END
          ) WITH ORDINALITY AS t(perm, ord)
      ) b
     WHERE NOT EXISTS (
       SELECT 1 FROM public.users_permissions p WHERE p.parent_id = u.id
     )
  $sql$;
END
$do$;
