-- Orders.promoCode relationship (ADR-0018, #325).
--
-- The promo-code reporting panel groups active tickets by the order's applied
-- code, so orders need a `promo_code_id` -> promo_codes link. This slice adds
-- the column, its index and FK; the checkout/webhook path that populates it
-- lands in #324. Attribution + reporting only — `order.total` stays the money
-- source of truth (Stripe amountReceived).
--
-- On a fresh DB 00-base.sql already created every object below, so this file is
-- a no-op there; on an older prod DB it adds the join column + index + FK.
-- All statements are guarded (IF NOT EXISTS / DO … EXCEPTION) and safe to re-run
-- on every restart per db/schema/README.md.
--
-- ORDERING: this FK references promo_codes(id), so it MUST run after
-- migrate-promo-codes.sql. bootstrap-db applies db/schema/*.sql alphabetically,
-- so the filename is "migrate-promo-orders" (sorts after "migrate-promo-codes"),
-- NOT "migrate-orders-promo-code" (would sort before "migrate-promo-codes" and
-- crash an existing prod DB with "relation promo_codes does not exist").

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promo_code_id integer;

CREATE INDEX IF NOT EXISTS orders_promo_code_idx ON orders (promo_code_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_promo_code_id_promo_codes_id_fk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_promo_code_id_promo_codes_id_fk
      FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE SET NULL;
  END IF;
END $$;
