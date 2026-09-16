-- The Zaduženi, and whose hand locked a postava (#658, ADR-0029).
--
-- Two fields on `shows`:
--
--   * `listKeepers` — the moreškanti put in charge of ONE evening's list. A
--     `hasMany` relationship, so Payload stores it the way it stores every
--     many-relationship: a `<table>_rels` child keyed by `path`. This is the
--     FIRST such table in this schema — `payload_locked_documents_rels` and
--     `payload_preferences_rels` are Payload's own — so the whole table, its
--     sequence, its key and its four indexes are created here rather than a
--     column being added to something that already exists.
--   * `lineupConfirmedBy` — the ACCOUNT that confirmed the lineup. A plain
--     relationship, so it is one nullable integer column with an FK.
--
-- The DDL below is not hand-designed: it is what Payload's own `push` produced
-- against a throwaway database, read back with `pg_dump` and made idempotent.
-- That is the contract the schema-drift gate checks, and inventing a shape here
-- that Payload would not generate is how that gate fails.
--
-- ON DELETE: `shows_rels_parent_fk` cascades, so deleting a performance takes
-- its delegation with it, and `shows_rels_members_fk` cascades, so deleting a
-- Member removes them from every evening that named them. Both are Payload's
-- choice, kept verbatim. `shows_lineup_confirmed_by_id_users_id_fk` is SET NULL:
-- deleting an account must not delete the evening it locked, it only takes the
-- name off the signature.
--
-- ORDERING: bootstrap-db.mjs applies db/schema/*.sql in plain filename order on
-- every restart (db/schema/README.md), with no dependency resolution. This file
-- references `shows`, `members` and `users`, all created by `00-base.sql`, which
-- sorts first. It must keep sorting BEFORE `migrate-zz-drop-users-role.sql`,
-- which stays the last `migrate-*` file (#398, asserted by
-- `src/lib/db-schema-safety.test.ts`); `zz-dk-` continues the `zz-d…` sequence
-- after `zz-dj-` and does.
--
-- Guarded and safe to re-run: every statement is IF NOT EXISTS or wrapped in a
-- duplicate-object guard, and not one of them writes a row.

ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS lineup_confirmed_by_id integer;

CREATE INDEX IF NOT EXISTS shows_lineup_confirmed_by_idx
  ON public.shows USING btree (lineup_confirmed_by_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shows_lineup_confirmed_by_id_users_id_fk'
      AND conrelid = 'public.shows'::regclass
  ) THEN
    ALTER TABLE ONLY public.shows
    ADD CONSTRAINT shows_lineup_confirmed_by_id_users_id_fk
    FOREIGN KEY (lineup_confirmed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.shows_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    members_id integer
);

CREATE SEQUENCE IF NOT EXISTS public.shows_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.shows_rels_id_seq OWNED BY public.shows_rels.id;

ALTER TABLE ONLY public.shows_rels ALTER COLUMN id SET DEFAULT nextval('public.shows_rels_id_seq'::regclass);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shows_rels_pkey' AND conrelid = 'public.shows_rels'::regclass
  ) THEN
    ALTER TABLE ONLY public.shows_rels ADD CONSTRAINT shows_rels_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shows_rels_parent_fk' AND conrelid = 'public.shows_rels'::regclass
  ) THEN
    ALTER TABLE ONLY public.shows_rels
    ADD CONSTRAINT shows_rels_parent_fk
    FOREIGN KEY (parent_id) REFERENCES public.shows(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shows_rels_members_fk' AND conrelid = 'public.shows_rels'::regclass
  ) THEN
    ALTER TABLE ONLY public.shows_rels
    ADD CONSTRAINT shows_rels_members_fk
    FOREIGN KEY (members_id) REFERENCES public.members(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shows_rels_order_idx ON public.shows_rels USING btree ("order");
CREATE INDEX IF NOT EXISTS shows_rels_parent_idx ON public.shows_rels USING btree (parent_id);
CREATE INDEX IF NOT EXISTS shows_rels_path_idx ON public.shows_rels USING btree (path);
CREATE INDEX IF NOT EXISTS shows_rels_members_id_idx ON public.shows_rels USING btree (members_id);
