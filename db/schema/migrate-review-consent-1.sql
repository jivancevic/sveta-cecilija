-- Review-email soft opt-in + unsubscribe (#148, ADR-0008).
--
-- Adds the per-order opt-out flag and a per-order opt-out token. The token is
-- generated lazily when the review email is sent (the cron route fills it in),
-- so no backfill is needed here. The unsubscribe route resolves the token and
-- sets review_opt_out; the review dispatcher skips opted-out orders.
--
-- No row mutation (only ADD COLUMN / CREATE INDEX), so this is inherently safe
-- to re-run on a populated DB.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_opt_out_token varchar;

-- One token = one order. NULLs allowed (orders that never got a review email).
CREATE UNIQUE INDEX IF NOT EXISTS orders_review_opt_out_token_idx
  ON orders (review_opt_out_token);
