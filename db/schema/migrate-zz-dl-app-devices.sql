-- `app_devices`: the server-side trace of a browser that opened Cecilija (#652,
-- ADR-0028).
--
-- Whether a moreškant has the app INSTALLED has always been a browser fact and
-- never left the browser (`src/lib/app/platform.ts` decides it for the install
-- banner and throws it away). The only device trace on the server is
-- `push_subscriptions`, which answers a different question — "does this device
-- ring" — and only for the devices that said yes to it. So the roster has
-- nothing to read, and #653 needs something honest.
--
-- A RAW table, deliberately not a Payload collection, for the same reasons
-- `push_subscriptions` is not (ADR-0024): nobody ever edits a device in the
-- Backoffice, the rows are written only by an `/app` route, and a row is a fact
-- about a browser rather than a document. Because Payload's push never emits
-- it, it must NOT appear in the generated `00-base.sql` — the drift gate only
-- requires the bootstrap schema to be a SUPERSET of Payload's, so an extra
-- table here is fine and a regeneration would silently drop anything
-- hand-added there.
--
-- ORDERING: bootstrap-db.mjs applies these files in plain filename order with
-- no dependency resolution (db/schema/README.md), so a file carrying a foreign
-- key must sort after whatever creates the table it points at. The one FK here
-- points at `users`, which `00-base.sql` builds first on a fresh database and
-- which has existed on every populated one since the first deploy — so like
-- `migrate-push.sql` this file needs no prefix for correctness. It takes the
-- next letter in the `zz-d*` sequence anyway (`dk` is #651's
-- `migrate-zz-dk-drop-members-email.sql`), which keeps the group readable in
-- the order it was written and, more importantly, keeps it BEFORE
-- `migrate-zz-drop-users-role.sql`: that file must stay the last `migrate-*`
-- one (#398, asserted by `src/lib/db-schema-safety.test.ts`), and 'dl-' < 'drop'
-- because 'l' < 'r'.
--
-- Every statement is guarded and safe to re-run on every restart. Nothing here
-- writes or mutates a row, so a second restart is a pure no-op.

-- One row per BROWSER, not per account.
--
--   `device_id` is a random id this app mints and hands back in a long-lived
--   `HttpOnly` cookie (`src/lib/app/device.ts`), exactly like
--   `cecilija_onboarded` and for exactly the same reason: Safari's ITP caps a
--   script-written cookie at seven days, so a browser-written year quietly
--   becomes next week. It is NOT a user-agent fingerprint, which folds two
--   iPhones into one row.
--
--   UNIQUE across the whole table rather than per user, like
--   `push_subscriptions.endpoint` and for the same reason: if a dancer signs
--   out of a phone and a voditelj signs in, the device must MOVE to the new
--   account rather than exist twice. Two browsers on one account stay two rows,
--   because they carry two cookies — which is the point: a phone's trace must
--   survive its owner opening the app on a laptop.
--
--   ON DELETE CASCADE, not Payload's SET NULL: a deleted account's devices are
--   nobody's, and `user_id` is NOT NULL.
--
--   `standalone` is "this browser has reported itself installed", not "it is
--   installed right now". The write ORs rather than replaces
--   (`src/lib/app/device-store.ts`), because on Android an installed app and a
--   plain tab share one cookie jar, and a mark that blinked off every time
--   somebody tapped a link in a message would be worse than useless. The
--   column starts false and only a device's own report ever sets it: nothing
--   backfills an install from a user agent, because a guess written into a
--   database is the worst kind.
CREATE TABLE IF NOT EXISTS app_devices (
    id            serial PRIMARY KEY,
    device_id     text NOT NULL,
    user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    standalone    boolean DEFAULT false NOT NULL,
    user_agent    text,
    first_seen_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    last_seen_at  timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS app_devices_device_id_unique_idx
  ON app_devices USING btree (device_id);

-- The roster reads "every device of these accounts" (#653), one grouped query
-- over a handful of ids.
CREATE INDEX IF NOT EXISTS app_devices_user_idx
  ON app_devices USING btree (user_id);
