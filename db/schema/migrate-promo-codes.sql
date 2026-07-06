-- Member promo codes collection (#319, ADR-0018).
--
-- Admin-created vanity discount codes attributed to a society Member. The guest
-- types a code at online checkout and an adult ticket drops to `adult_price_eur`
-- (child stays €10). This slice is the collection + admin CRUD only; the
-- pricing/checkout engine lands later (#324). Deliberately minimal: a unique
-- code, a required member link, a one-value discount type, its price parameter
-- and an `active` kill-switch — no usage cap, no expiry (v1).
--
-- On a fresh DB 00-base.sql already created every object below, so this file is
-- a no-op there; on an older prod DB it adds the `promo_codes` table, its unique
-- code index + member FK and the payload session-lock join column.
--
-- All statements are guarded (IF NOT EXISTS / DO … EXCEPTION) and safe to
-- re-run on every restart per db/schema/README.md.

-- 1. The discount_type enum. Only v1 value: adult-price-override. Kept with the
--    table (a CREATE TYPE, not an ADD VALUE, so it can share this transaction).
DO $$ BEGIN
  CREATE TYPE public.enum_promo_codes_discount_type AS ENUM ('adult-price-override');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. The promo_codes table. `member_id` is a required relationship -> members.
CREATE TABLE IF NOT EXISTS promo_codes (
  id             serial PRIMARY KEY,
  code           varchar     NOT NULL,
  member_id      integer     NOT NULL,
  discount_type  public.enum_promo_codes_discount_type NOT NULL DEFAULT 'adult-price-override',
  adult_price_eur numeric    NOT NULL DEFAULT 15,
  active         boolean     DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Unique vanity code (the DB constraint the acceptance criteria requires).
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_idx ON promo_codes (code);
CREATE INDEX IF NOT EXISTS promo_codes_member_idx ON promo_codes (member_id);
CREATE INDEX IF NOT EXISTS promo_codes_created_at_idx ON promo_codes (created_at);
CREATE INDEX IF NOT EXISTS promo_codes_updated_at_idx ON promo_codes (updated_at);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'promo_codes_member_id_members_id_fk'
      AND conrelid = 'public.promo_codes'::regclass
  ) THEN
    ALTER TABLE promo_codes
      ADD CONSTRAINT promo_codes_member_id_members_id_fk
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Payload's session-lock join table references every collection by
--    <slug>_id. Add the promo_codes join column + its index + FK so the admin
--    document-lock query resolves once PromoCodes is a real collection.
ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS promo_codes_id integer;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_promo_codes_id_idx
  ON payload_locked_documents_rels (promo_codes_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payload_locked_documents_rels_promo_codes_fk'
      AND conrelid = 'public.payload_locked_documents_rels'::regclass
  ) THEN
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_promo_codes_fk
      FOREIGN KEY (promo_codes_id) REFERENCES promo_codes(id) ON DELETE CASCADE;
  END IF;
END $$;
