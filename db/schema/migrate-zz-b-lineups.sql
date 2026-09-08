-- The lineups table and the two Shows confirmation columns (#432, ADR-0024
-- phase 4). Glossary: CONTEXT.md → *Lineup (postava)*.
--
-- One row per (performance, moreškant): the dance role that person actually
-- danced. Exactly one role each, which is what the unique index on
-- (performance_id, member_id) carries — the statistics count rows, so a second
-- row for the same pair would double count a dancer for one evening.
--
-- Confirmation is NOT a column here: it is one flag per performance
-- (shows.lineup_confirmed), because a postava is confirmed as a whole.
--
-- ORDERING: the `-b-` is a SORT KEY, not a word. bootstrap-db.mjs applies these
-- files in plain filename order with no dependency resolution
-- (db/schema/README.md), so this file has to land in a window with a wall on
-- each side: AFTER `migrate-members.sql` and `migrate-shows-performance.sql`,
-- which create the tables its foreign keys reach, and BEFORE
-- `migrate-zz-drop-users-role.sql`, which must remain the last migrate-* file
-- (#398, asserted by src/lib/db-schema-safety.test.ts). A plain
-- `migrate-zz-lineups.sql` would sort after the drop ('d' < 'l') and break that
-- rule, so the letter buys the position: 'attendance' < 'b-lineups' < 'drop'.
--
-- On a fresh DB 00-base.sql has already created everything below, so this file
-- is a no-op there; on the existing prod DB it adds the table and the columns.
-- Every statement is guarded and safe to re-run on every restart. Nothing here
-- writes a row.

-- 1. The enum Payload emits for the role select. Same vocabulary as the
--    members_roles / enum_members_primary_role one, and deliberately its own
--    type: Payload push builds one enum per select field.
DO $$ BEGIN
CREATE TYPE public.enum_lineups_role AS ENUM (
    'crni',
    'bili',
    'crni_kralj',
    'otmanovic',
    'bili_kralj',
    'bula'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. The table, exactly as Payload push builds it.
CREATE TABLE IF NOT EXISTS lineups (
    id             integer NOT NULL,
    performance_id integer NOT NULL,
    member_id      integer NOT NULL,
    role           public.enum_lineups_role NOT NULL,
    updated_at     timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at     timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS lineups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE lineups_id_seq OWNED BY lineups.id;

ALTER TABLE ONLY lineups ALTER COLUMN id SET DEFAULT nextval('lineups_id_seq'::regclass);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lineups_pkey' AND conrelid = 'public.lineups'::regclass
  ) THEN
    ALTER TABLE ONLY lineups ADD CONSTRAINT lineups_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- 3. Payload's own indexes.
CREATE INDEX IF NOT EXISTS lineups_performance_idx ON lineups USING btree (performance_id);
CREATE INDEX IF NOT EXISTS lineups_member_idx ON lineups USING btree (member_id);
CREATE INDEX IF NOT EXISTS lineups_created_at_idx ON lineups USING btree (created_at);
CREATE INDEX IF NOT EXISTS lineups_updated_at_idx ON lineups USING btree (updated_at);

-- 4. One role per moreškant per performance.
--    THIS FILE IS THE INDEX'S ONLY HOME. Payload's push never emits a
--    two-column unique index (`unique: true` covers one column), so it must not
--    appear in the generated 00-base.sql, which a regeneration would silently
--    drop. Same rule as attendance_performance_member_unique_idx in
--    migrate-zz-attendance.sql.
CREATE UNIQUE INDEX IF NOT EXISTS lineups_performance_member_unique_idx
  ON lineups USING btree (performance_id, member_id);

-- 5. The relationships. ON DELETE SET NULL is Payload's own shape; the drift
--    gate compares this file's result against a Payload push, so it is mirrored
--    rather than tightened here. The NOT NULL columns are why Shows and Members
--    carry beforeDelete cascade hooks (#432, story 36).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lineups_performance_id_shows_id_fk' AND conrelid = 'public.lineups'::regclass
  ) THEN
    ALTER TABLE ONLY lineups
      ADD CONSTRAINT lineups_performance_id_shows_id_fk
      FOREIGN KEY (performance_id) REFERENCES shows(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lineups_member_id_members_id_fk' AND conrelid = 'public.lineups'::regclass
  ) THEN
    ALTER TABLE ONLY lineups
      ADD CONSTRAINT lineups_member_id_members_id_fk
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Payload's document-lock join table gains a column per collection.
ALTER TABLE payload_locked_documents_rels ADD COLUMN IF NOT EXISTS lineups_id integer;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_lineups_id_idx
  ON payload_locked_documents_rels USING btree (lineups_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payload_locked_documents_rels_lineups_fk'
      AND conrelid = 'public.payload_locked_documents_rels'::regclass
  ) THEN
    ALTER TABLE ONLY payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_lineups_fk
      FOREIGN KEY (lineups_id) REFERENCES lineups(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 7. The confirmation, one flag per performance. `DEFAULT false` mirrors the
--    Payload field's defaultValue: an evening nobody has confirmed is a draft,
--    and a draft reaches no dancer and no statistic.
ALTER TABLE shows ADD COLUMN IF NOT EXISTS lineup_confirmed boolean DEFAULT false;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS lineup_confirmed_at timestamp(3) with time zone;
