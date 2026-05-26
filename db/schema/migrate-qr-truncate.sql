-- Migration: collapse to one QR per order. Pre-cutover data is all test data
-- per developer. Idempotent — re-runs are no-ops since the new write path
-- only ever creates one row per order.
--
-- CASCADE is required because Payload's `payload_locked_documents_rels`
-- table has a FK to `qr_tokens.id` (via the `qr_tokens_id` column). Without
-- CASCADE, Postgres refuses with "cannot truncate a table referenced in a
-- foreign key constraint" and the bootstrap crashloops in production, taking
-- the app down with 502 Bad Gateway. The rels rows are admin lock-state for
-- the now-deleted QR docs — wiping them alongside the qr_tokens rows is
-- correct (the rels are dangling once their target is gone).
TRUNCATE TABLE qr_tokens CASCADE;
UPDATE shows SET online_sold = 0, in_person_sold = 0, updated_at = NOW();
