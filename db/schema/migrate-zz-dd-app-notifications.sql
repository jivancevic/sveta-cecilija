-- The Sandučić obavijesti: one row per account per notification (#496).
--
-- A RAW table, deliberately not a Payload collection, for the same three
-- reasons `push_subscriptions` is not (migrate-push.sql, ADR-0024): nobody ever
-- edits a notification in the Backoffice, every row is written by a sender
-- rather than by a person, and the query that matters — "how many has this
-- account not read" — is a partial-index count rather than a document read.
-- `src/lib/app/notifications-store.ts` is its only reader and writer.
--
-- It is NOT `performance_notifications`, which stays what it is: the
-- once-per-performance CLAIM that stops two cron runs both sending. That table
-- is keyed on (performance, type) and knows nothing about people; this one is
-- keyed on a person and knows nothing about claims.
--
-- Because Payload's push never emits this table, it must NOT appear in the
-- generated `00-base.sql` — the drift gate only requires the bootstrap schema
-- to be a SUPERSET of Payload's, so an extra table here is fine while a
-- regeneration of the baseline would silently drop anything hand-added there.
--
-- ORDERING: bootstrap-db.mjs applies these files in plain filename order with
-- no dependency resolution (db/schema/README.md), so a file carrying a foreign
-- key must sort after whatever creates the table it points at. The only FK here
-- reaches `users`, which `00-base.sql` builds first on a fresh database and
-- which has existed on every populated one since the first deploy — so the `zz`
-- prefix is not strictly needed. It carries one anyway, continuing the
-- `zz-d…` sequence (`zz-d-oauth`, `zz-da-offline-sales`, `zz-db-join`,
-- `zz-dc-orders-cancel-notified`) so the file order stays readable as history,
-- and `zz-dd-` still sorts BEFORE `migrate-zz-drop-users-role.sql`, which must
-- stay the final `migrate-*` file (#398, asserted by `db-schema-safety.test.ts`).
--
-- Every statement is guarded and safe to re-run on every restart. Nothing here
-- writes or mutates a row.

-- One row per ACCOUNT per notification, not per device and not per Member
-- (#496): the whole point of the inbox is that the unread count agrees on the
-- phone and on the laptop, and `push_subscriptions` is the per-device table.
--
-- ON DELETE CASCADE, not Payload's SET NULL: a deleted account's notifications
-- are nobody's, and `user_id` is NOT NULL.
--
-- `kind` is plain text rather than an enum, the same decision
-- `performance_notifications.type` made: these are our own notification kinds
-- (`src/lib/app/notification-audience.ts`), never a Payload select field, and
-- widening a text column costs nothing while widening an enum needs its own
-- migration file (docs/agents/db-bootstrap.md).
--
-- `url` is where a tap lands, stored rather than derived: a notification is a
-- record of what a person was told at the time, so a row must keep pointing at
-- the evening it was about even after the rules for building that path change.
CREATE TABLE IF NOT EXISTS app_notifications (
    id         serial PRIMARY KEY,
    user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       text NOT NULL,
    title      text NOT NULL,
    body       text NOT NULL,
    url        text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    -- NULL means unread. A timestamp rather than a boolean because "when did
    -- you see this" is the question a voditelj asks about a missed alarm.
    read_at    timestamp(3) with time zone
);

-- The inbox screen's read ("this account, newest first") and the bell's count
-- ("this account, read_at IS NULL") are the only two queries there are, and
-- both open with `user_id`, so one composite index serves both.
CREATE INDEX IF NOT EXISTS app_notifications_user_read_idx
  ON app_notifications USING btree (user_id, read_at);

-- The list's own order. Kept separate from the index above because the count
-- never reads it and the list never reads `read_at`.
CREATE INDEX IF NOT EXISTS app_notifications_user_created_idx
  ON app_notifications USING btree (user_id, created_at DESC);
