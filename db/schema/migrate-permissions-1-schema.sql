-- Migration step 1/2: the permission set's schema. See ADR-0023 (#394).
--
-- 00-base.sql builds these objects on a FRESH database only (its CREATE TYPE
-- is wrapped in a duplicate_object-swallowing DO block and its CREATE TABLEs
-- are IF NOT EXISTS, so neither reaches an existing database whose `users`
-- table is already there). Per ADR-0013 both files are required: 00-base.sql
-- for new databases, this one for every database that already exists.
--
-- The shape below is exactly what a Payload dev push emits for a `hasMany`
-- select field: a child table keyed to the parent by `parent_id` with a
-- 1-based `order` column, plus a plain boolean column for the `shared`
-- checkbox. Verified against a push into a throwaway DB and the drift gate.
--
-- Step 2 (migrate-permissions-2-data.sql) fills the rows. It lives in a
-- sibling file because bootstrap-db.mjs sends each file as one implicit
-- transaction, and this one CREATEs the enum the data step writes into;
-- keeping them apart also matches the two-file enum rule from ADR-0013.
-- Filename sorts before it (…-1-… < …-2-…).
--
-- Idempotent.

DO $$ BEGIN
CREATE TYPE public.enum_users_permissions AS ENUM (
    'users',
    'tickets',
    'refunds',
    'door',
    'partner',
    'season_stats',
    'moreska',
    'moreskant',
    'finance',
    'editor',
    'dev'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Shared-account marker. Existing rows get `false` from the DEFAULT; step 2
-- flips the shared logins (tehnika, member) to true.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS shared boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.users_permissions (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_users_permissions,
    id integer NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.users_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.users_permissions_id_seq OWNED BY public.users_permissions.id;

ALTER TABLE ONLY public.users_permissions ALTER COLUMN id SET DEFAULT nextval('public.users_permissions_id_seq'::regclass);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_permissions_pkey' AND conrelid = 'public.users_permissions'::regclass) THEN
    ALTER TABLE ONLY public.users_permissions
    ADD CONSTRAINT users_permissions_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_permissions_parent_fk' AND conrelid = 'public.users_permissions'::regclass) THEN
    ALTER TABLE ONLY public.users_permissions
    ADD CONSTRAINT users_permissions_parent_fk FOREIGN KEY (parent_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_permissions_order_idx ON public.users_permissions USING btree ("order");

CREATE INDEX IF NOT EXISTS users_permissions_parent_idx ON public.users_permissions USING btree (parent_id);
