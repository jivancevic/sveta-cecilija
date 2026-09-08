-- The attendance table (#422, ADR-0024 phase 3).
--
-- One row per (performance, moreškant): the answer, the army it counts in, who
-- recorded it and when. "No answer" is the ABSENCE of a row, which is why the
-- unique index on (performance_id, member_id) is load-bearing rather than
-- decorative: the app upserts on that pair and deletes to clear an answer, so a
-- second row for the same pair would silently split one dancer's answer in two.
-- Payload does not emit that index (it is not a Payload `unique` field, which
-- only covers a single column), so it lives here and is mirrored by hand into
-- 00-base.sql, the same way members_moreskant_nickname_unique_idx is.
--
-- Named `migrate-zz-…` so it sorts AFTER every file that creates a table it
-- references (`members`, `shows`, `users`, `payload_locked_documents_rels`) —
-- bootstrap-db.mjs applies these files in plain filename order with no
-- dependency resolution (db/schema/README.md).
--
-- On a fresh DB 00-base.sql has already created everything below, so this file
-- is a no-op there; on the existing prod DB it adds the table. Every statement
-- is guarded and safe to re-run on every restart. Nothing here writes a row.

-- 1. The two enums Payload emits for the select fields.
DO $$ BEGIN
CREATE TYPE public.enum_attendance_status AS ENUM (
    'coming',
    'not_coming'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_attendance_army AS ENUM (
    'crni',
    'bili'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. The table, exactly as Payload push builds it.
CREATE TABLE IF NOT EXISTS attendance (
    id             integer NOT NULL,
    performance_id integer NOT NULL,
    member_id      integer NOT NULL,
    status         public.enum_attendance_status NOT NULL,
    army           public.enum_attendance_army,
    answered_by_id integer,
    answered_at    timestamp(3) with time zone,
    updated_at     timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at     timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE attendance_id_seq OWNED BY attendance.id;

ALTER TABLE ONLY attendance ALTER COLUMN id SET DEFAULT nextval('attendance_id_seq'::regclass);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_pkey' AND conrelid = 'public.attendance'::regclass
  ) THEN
    ALTER TABLE ONLY attendance ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- 3. Payload's own indexes.
CREATE INDEX IF NOT EXISTS attendance_performance_idx ON attendance USING btree (performance_id);
CREATE INDEX IF NOT EXISTS attendance_member_idx ON attendance USING btree (member_id);
CREATE INDEX IF NOT EXISTS attendance_answered_by_idx ON attendance USING btree (answered_by_id);
CREATE INDEX IF NOT EXISTS attendance_created_at_idx ON attendance USING btree (created_at);
CREATE INDEX IF NOT EXISTS attendance_updated_at_idx ON attendance USING btree (updated_at);

-- 4. One answer per moreškant per performance. The upsert key.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_performance_member_unique_idx
  ON attendance USING btree (performance_id, member_id);

-- 5. The relationships. ON DELETE SET NULL is Payload's own shape; the drift
--    gate compares this file's result against a Payload push, so it is mirrored
--    rather than tightened here.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_performance_id_shows_id_fk' AND conrelid = 'public.attendance'::regclass
  ) THEN
    ALTER TABLE ONLY attendance
      ADD CONSTRAINT attendance_performance_id_shows_id_fk
      FOREIGN KEY (performance_id) REFERENCES shows(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_member_id_members_id_fk' AND conrelid = 'public.attendance'::regclass
  ) THEN
    ALTER TABLE ONLY attendance
      ADD CONSTRAINT attendance_member_id_members_id_fk
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_answered_by_id_users_id_fk' AND conrelid = 'public.attendance'::regclass
  ) THEN
    ALTER TABLE ONLY attendance
      ADD CONSTRAINT attendance_answered_by_id_users_id_fk
      FOREIGN KEY (answered_by_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Payload's document-lock join table gains a column per collection.
ALTER TABLE payload_locked_documents_rels ADD COLUMN IF NOT EXISTS attendance_id integer;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_attendance_id_idx
  ON payload_locked_documents_rels USING btree (attendance_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payload_locked_documents_rels_attendance_fk'
      AND conrelid = 'public.payload_locked_documents_rels'::regclass
  ) THEN
    ALTER TABLE ONLY payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_attendance_fk
      FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE;
  END IF;
END $$;
