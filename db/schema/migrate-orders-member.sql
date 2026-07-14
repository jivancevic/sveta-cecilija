-- Comp ticket member attribution (#318, ADR-0019).
--
-- A comp order records WHICH society member received the free tickets, for
-- per-member reporting. Add the nullable orders.member_id FK -> members plus
-- its index. On a fresh DB 00-base.sql already created the column, index and
-- constraint, so every statement here is a no-op; on an older prod DB it adds
-- them. This file references no enum value, so it is safe to keep separate
-- from the ADD VALUE in migrate-comp-channel-enum.sql.
--
-- ORDERING: this FK references members(id), so it MUST run after
-- migrate-members.sql. bootstrap-db applies db/schema/*.sql alphabetically,
-- so the filename is "migrate-orders-member" (sorts after "migrate-members"),
-- NOT "migrate-comp-orders-member" (would sort before "migrate-members" and
-- crash an existing prod DB with "relation members does not exist").
--
-- All statements are guarded (IF NOT EXISTS / DO … EXCEPTION) and safe to
-- re-run on every restart per db/schema/README.md.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS member_id integer;

CREATE INDEX IF NOT EXISTS orders_member_idx ON orders (member_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_member_id_members_id_fk'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_member_id_members_id_fk
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
  END IF;
END $$;
