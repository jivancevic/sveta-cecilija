-- The rehearsal join code and the claims it collects (#463, ADR-0024).
--
-- Two RAW tables, deliberately not Payload collections (the rule
-- `push_subscriptions`, `marketing_optouts` and `oauth_*` already follow):
-- nobody edits either in `/admin`, a claim is a pending request rather than a
-- document, and the only writers are the `/app/join` routes and the voditelj's
-- approval. Because Payload's push never emits them, they must NOT appear in
-- the generated `00-base.sql` — the drift gate only requires the bootstrap
-- schema to be a SUPERSET of Payload's, so extra tables here are fine while a
-- regeneration would silently drop anything hand-added there.
--
-- ORDERING: bootstrap-db.mjs applies these files in plain filename order with
-- no dependency resolution (db/schema/README.md). The `-db-` is a SORT KEY, not
-- a word: it has to land after `migrate-members.sql` (the `members` FK) and
-- before `migrate-zz-drop-users-role.sql`, which must stay the last `migrate-*`
-- file (#398, asserted by `db-schema-safety.test.ts`). `zz-da` < `zz-db` <
-- `zz-dr`, so it sits between the offline-sales ledger and that drop.
--
-- Every statement is guarded and safe to re-run on every restart. Nothing here
-- writes or mutates a row.

-- 1. The shared code a voditelj puts on the wall at a rehearsal, beside the
--    `/app/instalacija` QR.
--
--    Stored in the CLEAR, unlike the OAuth credentials next door, and that is
--    not an oversight: this code is printed on a sheet of paper and read out
--    loud in a room. It is a door that is open for an evening, not a secret —
--    what protects the roster is that opening the door only gets you into a
--    QUEUE (table 2), which a voditelj standing in the same room approves by
--    hand. Its life is short and it can be rotated, so a photograph of the QR
--    does not become a standing invitation.
--
--    One row per code ever issued rather than one row updated in place: rotating
--    is then an INSERT, the old code dies of its own expiry, and the history of
--    who opened the room when survives for a season.
CREATE TABLE IF NOT EXISTS app_join_codes (
    code       text PRIMARY KEY,
    created_by integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS app_join_codes_expires_idx
  ON app_join_codes USING btree (expires_at);

-- 2. One dancer tapping their own name behind that code.
--
--    `secret_hash` is the dancer's device credential and is held as a SHA-256
--    hex hash, the `oauth_*` rule: once a voditelj approves the claim, that
--    secret is what opens a session, so the database must never hold a value
--    somebody reading a backup could use. The browser keeps the plaintext in an
--    httpOnly cookie and nowhere else.
--
--    `user_id` is filled at approval: the login the claim ended up creating (or
--    the one that already existed). NULL means "not approved yet", which is why
--    it is nullable while `member_id` is not.
--
--    ON DELETE CASCADE on the member, SET NULL on the user: a deleted Member's
--    claim is meaningless, while a deleted login leaves a claim that still
--    records what happened.
CREATE TABLE IF NOT EXISTS app_join_claims (
    id          serial PRIMARY KEY,
    member_id   integer NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    code        text,
    secret_hash text NOT NULL,
    -- pending | approved | rejected | expired. Plain text rather than an enum
    -- for the `performance_notifications.type` reason: these are our own
    -- values, never a Payload select field, and widening a text column costs
    -- nothing while widening an enum needs its own migration (db-bootstrap.md).
    status      text NOT NULL DEFAULT 'pending',
    user_id     integer REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamp(3) with time zone DEFAULT now() NOT NULL,
    expires_at  timestamp(3) with time zone NOT NULL,
    decided_by  integer REFERENCES users(id) ON DELETE SET NULL,
    decided_at  timestamp(3) with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS app_join_claims_secret_idx
  ON app_join_claims USING btree (secret_hash);

-- At most ONE pending claim per Member, enforced here rather than in a handler:
-- two phones tapping the same name would otherwise put two rows in front of the
-- voditelj, who would approve both and mint two logins for one dancer. A
-- partial index is the whole rule, and the claim route reads a violation as
-- "somebody already asked", which is the truth.
CREATE UNIQUE INDEX IF NOT EXISTS app_join_claims_one_pending_idx
  ON app_join_claims USING btree (member_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS app_join_claims_status_idx
  ON app_join_claims USING btree (status, created_at);
