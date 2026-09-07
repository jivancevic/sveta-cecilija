-- Migration step 2/2: give every existing user the permission bundle that
-- reproduces their current role. See ADR-0023 (#394).
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
-- this deploy. Afterwards the set is never empty again, so once a `users`
-- holder edits a set or clears the `shared` flag in /admin, this file never
-- overwrites either again. The one exception is a set emptied completely,
-- which is refilled — the safe direction, because the field is required, so a
-- truly empty set is a bug rather than a choice.
--
-- `role::text` is used throughout so the file stays parseable on a database
-- whose enum no longer carries one of these labels (same reason as
-- migrate-roles-2-data.sql).
--
-- Idempotent.

-- The two shared logins (ADR-0022 for `member`, the door device for `tehnika`).
-- Runs BEFORE the INSERT below and carries the SAME guard, so it fires exactly
-- once — on the first bootstrap after this deploy, while the permission set is
-- still empty. After the INSERT the set is never empty again, so a later edit
-- by a `users` holder (including turning `shared` off) sticks across restarts.
UPDATE public.users u
   SET shared = true
 WHERE u.shared IS DISTINCT FROM true
   AND u.role::text IN ('tehnika', 'member')
   AND NOT EXISTS (
     SELECT 1 FROM public.users_permissions p WHERE p.parent_id = u.id
   );

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
 );
