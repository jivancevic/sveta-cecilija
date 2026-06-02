-- Hybrid username login migration (#175, ADR-0010).
-- Runs after migrate-roles-2-data.sql (alphabetical order in bootstrap-db.mjs),
-- so the 'tehnika' role value already exists by the time the email-drop below
-- keys off it.
--
-- Adds a canonical `username` to every user, makes `email` nullable (so the
-- shared door account and partner logins can be username-only), backfills a
-- username from the email local-part, and drops the door account's email
-- (it has no inbox — ADR-0004 superseded by ADR-0010). Josip keeps his email
-- (only role='tehnika' rows are nulled), so migrate-roles-2-data.sql's
-- superadmin promotion (keyed on his email) is unaffected.
--
-- All four mutations are guarded (WHERE) and idempotent: re-running on an
-- already-migrated DB is a no-op. In dev, Payload's push:true subsequently
-- reconciles the column to the loginWithUsername config (username UNIQUE NOT
-- NULL); the backfill below guarantees no NULL username remains for that.

-- 1. The new identifier column (nullable until backfilled).
ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar;

-- 2. Email becomes optional. Must precede the email-null update below, which
--    would otherwise violate the NOT NULL constraint.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 3a. The shared door account gets the canonical username 'tehnika' (ADR-0010),
--     independent of whatever fake-email login string it currently carries
--     (prod 'tehnika@moreska.eu', dev 'door', …). There is one shared tehnika
--     account, so the value stays unique.
UPDATE users
   SET username = 'tehnika'
 WHERE username IS NULL
   AND role::text = 'tehnika';

-- 3b. Everyone else: backfill a username from the email local-part (e.g.
--     josip.ivancevic00@gmail.com -> josip.ivancevic00). Guarded so it only
--     touches un-backfilled rows.
UPDATE users
   SET username = split_part(email, '@', 1)
 WHERE username IS NULL
   AND email IS NOT NULL;

-- 4. Drop the door account's fake email — it is a login string with no inbox.
--    Keyed off role (::text so it stays parseable on a re-pushed enum) and
--    guarded on a non-null email so it is a no-op once applied.
UPDATE users
   SET email = NULL
 WHERE role::text = 'tehnika'
   AND email IS NOT NULL;

-- 5. Enforce username uniqueness. NULLs are allowed by a unique index, but step
--    3 leaves none behind for existing rows.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (username);
