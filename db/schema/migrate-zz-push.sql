-- Web push: device subscriptions and the once-per-performance claim
-- (#431, #435, ADR-0024 phase 4).
--
-- Two RAW tables, deliberately not Payload collections (ADR-0024): neither is
-- ever edited in `/admin`, both are written only by the `/app` routes and the
-- cron job, and a `push_subscriptions` row is a browser secret rather than a
-- document. `marketing_optouts` (app.sql) is the same shape and the same
-- reasoning. Because Payload's push never emits them, they must NOT appear in
-- the generated `00-base.sql` — the drift gate only requires the bootstrap
-- schema to be a SUPERSET of Payload's, so extra tables here are fine and a
-- regeneration would silently drop anything hand-added there.
--
-- Named `migrate-zz-push.sql` so it sorts AFTER every file that creates a table
-- it references (`users`, `shows`) — bootstrap-db.mjs applies these files in
-- plain filename order with no dependency resolution (db/schema/README.md).
-- ORDERING: must sort after 00-base.sql (users, shows) and after
-- migrate-zz-attendance.sql; `p` > `d` > `a`, so the `migrate-zz-` family
-- already places it last.
--
-- Every statement is guarded and safe to re-run on every restart. Nothing here
-- writes or mutates a row.

-- 1. One row per DEVICE (endpoint), not per user: a dancer's phone and tablet
--    are two subscriptions and both are supposed to ring (#430, story 4).
--
--    `endpoint` is UNIQUE across the whole table rather than per user, because
--    the push service's endpoint IS the device: if an account signs out and
--    another signs in on the same phone, the same endpoint must move to the new
--    user rather than exist twice and ring the wrong person. The subscribe
--    route relies on that with `ON CONFLICT (endpoint) DO UPDATE`.
--
--    ON DELETE CASCADE, not Payload's SET NULL: a deleted account's devices are
--    nobody's, and `user_id` is NOT NULL.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          serial PRIMARY KEY,
    user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint    text NOT NULL,
    p256dh      text NOT NULL,
    auth        text NOT NULL,
    user_agent  text,
    created_at  timestamp(3) with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique_idx
  ON push_subscriptions USING btree (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions USING btree (user_id);

-- 2. The once-per-performance claim for the scheduled notifications (#435).
--
--    The idempotency guard is an ATOMIC CLAIM on this table
--    (`INSERT … ON CONFLICT DO NOTHING RETURNING id`), the dispute-claim
--    pattern (src/lib/dispute/handle-dispute.ts): a check-then-act would let
--    two overlapping cron runs both read "not sent" and both send. The unique
--    (performance_id, type) pair is what makes the claim a claim.
--
--    `type` is plain text rather than an enum: these are our own notification
--    kinds, never a Payload select field, and widening a text column costs
--    nothing while widening an enum needs its own migration file
--    (db-bootstrap.md).
CREATE TABLE IF NOT EXISTS performance_notifications (
    id             serial PRIMARY KEY,
    performance_id integer NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    type           text NOT NULL,
    claimed_at     timestamp(3) with time zone DEFAULT now() NOT NULL,
    -- Filled in after the send, purely for reading the log later. A NULL means
    -- "claimed, outcome unknown" (the process died mid-send), never "not sent".
    devices        integer
);

CREATE UNIQUE INDEX IF NOT EXISTS performance_notifications_unique_idx
  ON performance_notifications USING btree (performance_id, type);
