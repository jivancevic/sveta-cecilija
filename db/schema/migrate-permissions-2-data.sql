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
-- the INSERT only touches users whose permission set is still empty, so once a
-- `users` holder edits a set in /admin this file never overwrites it again —
-- including the case where they deliberately clear a permission but leave at
-- least one (an emptied set is refilled, which is the safe direction: the field
-- is required, so a truly empty set is a bug, not a choice).
--
-- `role::text` is used throughout so the file stays parseable on a database
-- whose enum no longer carries one of these labels (same reason as
-- migrate-roles-2-data.sql).
--
-- Idempotent.

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

-- The two shared logins (ADR-0022 for `member`, the door device for `tehnika`).
-- Guarded on the current value, so the second run matches no rows and a
-- deliberate later change by a `users` holder is only re-applied if it put the
-- flag back to false — acceptable, because these two accounts are shared by
-- definition and nothing else in the system is.
UPDATE public.users
   SET shared = true
 WHERE shared IS DISTINCT FROM true
   AND role::text IN ('tehnika', 'member');
