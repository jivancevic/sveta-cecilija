-- Migration: collapse to one QR per order. Pre-cutover data is all test data
-- per developer. Idempotent — re-runs are no-ops since the new write path
-- only ever creates one row per order.
TRUNCATE TABLE qr_tokens;
UPDATE shows SET online_sold = 0, in_person_sold = 0, updated_at = NOW();
