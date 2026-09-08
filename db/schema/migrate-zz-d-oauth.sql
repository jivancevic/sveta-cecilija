-- OAuth 2.1 for the MCP connector: authorization codes and access tokens
-- (#438, ADR-0024 phase 4).
--
-- Two RAW tables, deliberately not Payload collections (the ADR-0024 rule that
-- `push_subscriptions` and `marketing_optouts` already follow): nobody edits a
-- credential in `/admin`, a token row is a secret rather than a document, and
-- the only writers are `/app/authorize`, `/api/oauth/token` and the MCP route.
-- Because Payload's push never emits them, they must NOT appear in the
-- generated `00-base.sql` — the drift gate only requires the bootstrap schema
-- to be a SUPERSET of Payload's, so extra tables here are fine while a
-- regeneration would silently drop anything hand-added there.
--
-- ORDERING: bootstrap-db.mjs applies these files in plain filename order with
-- no dependency resolution (db/schema/README.md). The `-d-` is a SORT KEY, not
-- a word — the `-b-lineups` / `-c-orders-comp-issued-by` convention. Both FKs
-- point at `users`, which `00-base.sql` builds first on a fresh database and
-- which has existed on every populated one since the first deploy, so the file
-- only has to land BEFORE `migrate-zz-drop-users-role.sql`, which must stay the
-- last `migrate-*` file (#398, asserted by `db-schema-safety.test.ts`).
-- `migrate-zz-d-oauth` < `migrate-zz-drop-users-role` because '-' (0x2d) sorts
-- before 'r'.
--
-- NOTHING HERE IS STORED IN THE CLEAR. Both the authorization code and the
-- access token are held as a SHA-256 hex hash: the database never sees a
-- credential it could hand to whoever reads a backup. A code additionally lives
-- five minutes and is deleted the moment it is redeemed (`DELETE … RETURNING`
-- in `src/lib/mcp/oauth-store.ts`, which is what makes single use atomic).
--
-- Every statement is guarded and safe to re-run on every restart. Nothing here
-- writes or mutates a row.

-- 1. The pending authorization code. Short-lived, single-use, carrying the PKCE
--    challenge that `/api/oauth/token` verifies against the client's verifier.
--
--    ON DELETE CASCADE, not Payload's SET NULL: a deleted account's pending
--    code belongs to nobody, and `user_id` is NOT NULL.
CREATE TABLE IF NOT EXISTS oauth_codes (
    code_hash             text PRIMARY KEY,
    client_id             text NOT NULL,
    user_id               integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redirect_uri          text NOT NULL,
    code_challenge        text NOT NULL,
    code_challenge_method text NOT NULL,
    resource              text,
    scope                 text,
    expires_at            timestamp(3) with time zone NOT NULL,
    created_at            timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_codes_expires_idx
  ON oauth_codes USING btree (expires_at);

-- 2. The issued access token. ONE YEAR (#430, story 59) and no refresh token:
--    the connection has to survive a season, and a refresh flow would be a
--    second set of rules to get wrong for no gain.
--
--    Revocation is a row delete; the runbook for it is in
--    docs/agents/deployment.md.
--
--    The unique index on the hash is what lets `verifyToken` be a single
--    indexed lookup, and what makes a re-inserted token a no-op rather than a
--    duplicate.
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id                serial PRIMARY KEY,
    access_token_hash text NOT NULL,
    client_id         text NOT NULL,
    user_id           integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource          text,
    scope             text,
    expires_at        timestamp(3) with time zone NOT NULL,
    created_at        timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_tokens_access_hash_unique_idx
  ON oauth_tokens USING btree (access_token_hash);

CREATE INDEX IF NOT EXISTS oauth_tokens_user_idx
  ON oauth_tokens USING btree (user_id);
