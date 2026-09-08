-- Moreškant identity on Members + Users.member (#420, ADR-0024 phase 3).
--
-- A Member becomes a dancer: `is_moreskant` plus nickname, mobile, email, a
-- hasMany `members_roles` table for the dance roles and a single `primary_role`.
-- `users.member_id` links a login to that dancer.
--
-- On a fresh DB 00-base.sql already created every object below, so this file is
-- a no-op there; on an existing prod DB it adds them. Sorts AFTER
-- migrate-members.sql (the file that creates `members` on an older DB), which
-- is what the plain-filename ordering of bootstrap-db.mjs requires.
--
-- Every statement is guarded (IF NOT EXISTS / DO … EXCEPTION) and safe to
-- re-run on every restart per db/schema/README.md. Nothing here writes a row:
-- the 14 existing members stay `is_moreskant = false` through the column
-- default until a voditelj flags them by hand.

-- 1. The dance-role vocabulary (ADR-0024). Payload emits one enum per select
--    field, so the same six values exist under two type names.
DO $$ BEGIN
CREATE TYPE public.enum_members_roles AS ENUM (
    'crni',
    'bili',
    'crni_kralj',
    'otmanovic',
    'bili_kralj',
    'bula'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_members_primary_role AS ENUM (
    'crni',
    'bili',
    'crni_kralj',
    'otmanovic',
    'bili_kralj',
    'bula'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. The moreškant half of a Member.
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_moreskant boolean DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS nickname character varying;
ALTER TABLE members ADD COLUMN IF NOT EXISTS mobile character varying;
ALTER TABLE members ADD COLUMN IF NOT EXISTS email character varying;
ALTER TABLE members ADD COLUMN IF NOT EXISTS primary_role public.enum_members_primary_role;

-- 3. Nickname uniqueness, case-insensitive and only among moreškanti — the
--    database half of the rule `src/lib/moreskant-profile.ts` enforces on save.
--    Partial so the 14 attribution-only members (all with a NULL nickname) and
--    any future non-dancer are outside it entirely.
--
--    THIS FILE IS THE INDEX'S ONLY HOME. Payload's push never emits it (a
--    partial expression index is not a field config), so it must not appear in
--    the generated 00-base.sql, which a regeneration would silently drop — the
--    same rule that keeps critical_events' partial unique index in app.sql
--    alone. Its home is here rather than app.sql because app.sql sorts first
--    and the columns it indexes are added above.
CREATE UNIQUE INDEX IF NOT EXISTS members_moreskant_nickname_unique_idx
  ON members (lower(nickname))
  WHERE is_moreskant = true AND nickname IS NOT NULL;

-- 4. The hasMany roles table, exactly as Payload emits it.
CREATE TABLE IF NOT EXISTS members_roles (
    "order"   integer NOT NULL,
    parent_id integer NOT NULL,
    value     public.enum_members_roles,
    id        integer NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS members_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE members_roles_id_seq OWNED BY members_roles.id;

ALTER TABLE ONLY members_roles ALTER COLUMN id SET DEFAULT nextval('members_roles_id_seq'::regclass);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_roles_pkey' AND conrelid = 'public.members_roles'::regclass
  ) THEN
    ALTER TABLE ONLY members_roles ADD CONSTRAINT members_roles_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS members_roles_order_idx ON members_roles USING btree ("order");
CREATE INDEX IF NOT EXISTS members_roles_parent_idx ON members_roles USING btree (parent_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_roles_parent_fk' AND conrelid = 'public.members_roles'::regclass
  ) THEN
    ALTER TABLE ONLY members_roles
      ADD CONSTRAINT members_roles_parent_fk
      FOREIGN KEY (parent_id) REFERENCES members(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. The login → dancer link. ON DELETE SET NULL: removing a Member must not
--    take an account with it (the account then fails the /app access decision,
--    which is the intended outcome).
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id integer;

CREATE INDEX IF NOT EXISTS users_member_idx ON users USING btree (member_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_member_id_members_id_fk' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE ONLY users
      ADD CONSTRAINT users_member_id_members_id_fk
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
  END IF;
END $$;
