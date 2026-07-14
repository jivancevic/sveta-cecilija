-- Faqs collection (GEO Phase 1, #308).
--
-- Public /faq content: one row per question/answer, grouped by category and
-- filtered by locale + published status. `answer` is a Payload richText
-- (Lexical) value -> jsonb. `locale`/`status` are plain select fields (NOT
-- Payload localisation), so there is no `faqs_locales` sub-table.
--
-- On a fresh DB 00-base.sql may already create these objects, so every
-- statement is guarded (CREATE … IF NOT EXISTS / DO … EXCEPTION) and safe to
-- re-run on every restart per db/schema/README.md. On an older prod DB this
-- adds the new `faqs` table, its enums, and the payload session-lock join
-- column. Sorts after 00-base.sql (references payload_locked_documents_rels).

-- 1. Enums for the three select fields. CREATE TYPE has no IF NOT EXISTS, so
--    guard each with DO … EXCEPTION WHEN duplicate_object.
DO $$ BEGIN
  CREATE TYPE enum_faqs_category AS ENUM
    ('about', 'story', 'dance', 'music', 'visiting', 'dancers', 'history');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE enum_faqs_locale AS ENUM ('en', 'hr');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE enum_faqs_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. The faqs table.
CREATE TABLE IF NOT EXISTS faqs (
  id          serial PRIMARY KEY,
  question    varchar             NOT NULL,
  answer      jsonb               NOT NULL,
  category    enum_faqs_category  NOT NULL,
  locale      enum_faqs_locale    NOT NULL DEFAULT 'en',
  "order"     numeric,
  status      enum_faqs_status    NOT NULL DEFAULT 'draft',
  updated_at  timestamptz         NOT NULL DEFAULT now(),
  created_at  timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faqs_created_at_idx ON faqs (created_at);
CREATE INDEX IF NOT EXISTS faqs_updated_at_idx ON faqs (updated_at);

-- 3. Payload's session-lock join table references every collection by
--    <slug>_id. Add the faqs join column + its index + FK so the admin
--    document-lock query resolves once Faqs is a real collection.
ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS faqs_id integer;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_faqs_id_idx
  ON payload_locked_documents_rels (faqs_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payload_locked_documents_rels_faqs_fk'
      AND conrelid = 'public.payload_locked_documents_rels'::regclass
  ) THEN
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_faqs_fk
      FOREIGN KEY (faqs_id) REFERENCES faqs(id) ON DELETE CASCADE;
  END IF;
END $$;
