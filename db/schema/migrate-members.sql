-- Members collection (#317, ADR-0019).
--
-- HGD society members: the attribution target for comp (goodwill) tickets and,
-- later, member promo codes (ADR-0018). Deliberately minimal (name/active/note)
-- with no money, law, login or commission. On a fresh DB 00-base.sql already
-- created every object below, so this file is a no-op there; on an older prod
-- DB it adds the new `members` table and the payload session-lock join column.
--
-- All statements are guarded (IF NOT EXISTS / DO … EXCEPTION) and safe to
-- re-run on every restart per db/schema/README.md.

-- 1. The members table itself. `note` is a Payload textarea -> varchar.
CREATE TABLE IF NOT EXISTS members (
  id          serial PRIMARY KEY,
  name        varchar     NOT NULL,
  active      boolean     DEFAULT true,
  note        varchar,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_created_at_idx ON members (created_at);
CREATE INDEX IF NOT EXISTS members_updated_at_idx ON members (updated_at);

-- 2. Payload's session-lock join table references every collection by
--    <slug>_id. Add the members join column + its index + FK so the admin
--    document-lock query resolves once Members is a real collection.
ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS members_id integer;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_members_id_idx
  ON payload_locked_documents_rels (members_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payload_locked_documents_rels_members_fk'
      AND conrelid = 'public.payload_locked_documents_rels'::regclass
  ) THEN
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_members_fk
      FOREIGN KEY (members_id) REFERENCES members(id) ON DELETE CASCADE;
  END IF;
END $$;
