-- GENERATED idempotent baseline — the full Payload-push schema (ADR-0013).
-- Do NOT hand-edit. Regenerate when a Payload collection changes:
--   see db/schema/README.md → "Regenerating 00-base.sql".
-- The CI schema-drift gate (.github/workflows/schema-drift.yml) fails the PR
-- if this file stops reproducing what Payload push would create.

DO $$ BEGIN
CREATE TYPE public.enum_contact_submissions_enquiry_type AS ENUM (
    'general',
    'private-moreska',
    'moreska-experience',
    'other'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_contact_submissions_status AS ENUM (
    'new',
    'handled'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_order_lookups_mode AS ENUM (
    'email',
    'name',
    'code'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_orders_channel AS ENUM (
    'online',
    'partner',
    'comp'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_orders_locale AS ENUM (
    'en',
    'hr'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_orders_refund_status AS ENUM (
    'none',
    'refunded'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_posts_locale AS ENUM (
    'en',
    'hr'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_posts_status AS ENUM (
    'draft',
    'published'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_shows_status AS ENUM (
    'active',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_shows_venue AS ENUM (
    'ljetno-kino',
    'zimsko-kino'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_tickets_cancel_reason AS ENUM (
    'storno',
    'refund'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_tickets_status AS ENUM (
    'active',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_tickets_type AS ENUM (
    'adult',
    'child'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE public.enum_users_role AS ENUM (
    'superadmin',
    'admin',
    'tehnika',
    'partner'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id integer NOT NULL,
    name character varying NOT NULL,
    email character varying NOT NULL,
    enquiry_type public.enum_contact_submissions_enquiry_type NOT NULL,
    message character varying NOT NULL,
    status public.enum_contact_submissions_status DEFAULT 'new'::public.enum_contact_submissions_status NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.contact_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.contact_submissions_id_seq OWNED BY public.contact_submissions.id;

CREATE TABLE IF NOT EXISTS public.order_lookups (
    id integer NOT NULL,
    user_id integer,
    show_id integer,
    query character varying,
    mode public.enum_order_lookups_mode,
    matched_order_id character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.order_lookups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.order_lookups_id_seq OWNED BY public.order_lookups.id;

CREATE TABLE IF NOT EXISTS public.orders (
    id integer NOT NULL,
    code character varying,
    channel public.enum_orders_channel DEFAULT 'online'::public.enum_orders_channel NOT NULL,
    partner_id integer,
    member_id integer,
    buyer_name character varying,
    email character varying,
    adult_count numeric NOT NULL,
    child_count numeric NOT NULL,
    total numeric NOT NULL,
    stripe_payment_intent_id character varying,
    refund_status public.enum_orders_refund_status DEFAULT 'none'::public.enum_orders_refund_status NOT NULL,
    show_id integer NOT NULL,
    locale public.enum_orders_locale,
    review_email_sent_at timestamp(3) with time zone,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;

CREATE TABLE IF NOT EXISTS public.partners (
    id integer NOT NULL,
    name character varying NOT NULL,
    oib character varying,
    billing_address character varying,
    commission_percent numeric DEFAULT 10 NOT NULL,
    active boolean DEFAULT true,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.partners_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.partners_id_seq OWNED BY public.partners.id;

CREATE TABLE IF NOT EXISTS public.members (
    id integer NOT NULL,
    name character varying NOT NULL,
    active boolean DEFAULT true,
    note character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.members_id_seq OWNED BY public.members.id;

CREATE TABLE IF NOT EXISTS public.payload_kv (
    id integer NOT NULL,
    key character varying NOT NULL,
    data jsonb NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.payload_kv_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payload_kv_id_seq OWNED BY public.payload_kv.id;

CREATE TABLE IF NOT EXISTS public.payload_locked_documents (
    id integer NOT NULL,
    global_slug character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.payload_locked_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payload_locked_documents_id_seq OWNED BY public.payload_locked_documents.id;

CREATE TABLE IF NOT EXISTS public.payload_locked_documents_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    users_id integer,
    shows_id integer,
    orders_id integer,
    tickets_id integer,
    contact_submissions_id integer,
    posts_id integer,
    order_lookups_id integer,
    partners_id integer,
    members_id integer
);

CREATE SEQUENCE IF NOT EXISTS public.payload_locked_documents_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payload_locked_documents_rels_id_seq OWNED BY public.payload_locked_documents_rels.id;

CREATE TABLE IF NOT EXISTS public.payload_migrations (
    id integer NOT NULL,
    name character varying,
    batch numeric,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.payload_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payload_migrations_id_seq OWNED BY public.payload_migrations.id;

CREATE TABLE IF NOT EXISTS public.payload_preferences (
    id integer NOT NULL,
    key character varying,
    value jsonb,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.payload_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payload_preferences_id_seq OWNED BY public.payload_preferences.id;

CREATE TABLE IF NOT EXISTS public.payload_preferences_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    users_id integer
);

CREATE SEQUENCE IF NOT EXISTS public.payload_preferences_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payload_preferences_rels_id_seq OWNED BY public.payload_preferences_rels.id;

CREATE TABLE IF NOT EXISTS public.posts (
    id integer NOT NULL,
    title character varying NOT NULL,
    slug character varying NOT NULL,
    locale public.enum_posts_locale DEFAULT 'en'::public.enum_posts_locale NOT NULL,
    excerpt character varying NOT NULL,
    hero_image character varying NOT NULL,
    hero_image_alt character varying,
    body jsonb NOT NULL,
    published_at timestamp(3) with time zone NOT NULL,
    updated_at_public timestamp(3) with time zone,
    status public.enum_posts_status DEFAULT 'draft'::public.enum_posts_status NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.posts_id_seq OWNED BY public.posts.id;

CREATE TABLE IF NOT EXISTS public.shows (
    id integer NOT NULL,
    date timestamp(3) with time zone NOT NULL,
    "time" character varying NOT NULL,
    venue public.enum_shows_venue DEFAULT 'ljetno-kino'::public.enum_shows_venue NOT NULL,
    online_sold numeric DEFAULT 0,
    in_person_sold numeric DEFAULT 0,
    legacy_reserved numeric DEFAULT 0,
    status public.enum_shows_status DEFAULT 'active'::public.enum_shows_status NOT NULL,
    venue_changed_at timestamp(3) with time zone,
    venue_changed_by_id integer,
    date_changed_at timestamp(3) with time zone,
    date_changed_by_id integer,
    original_date timestamp(3) with time zone,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.shows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.shows_id_seq OWNED BY public.shows.id;

CREATE TABLE IF NOT EXISTS public.tickets (
    id integer NOT NULL,
    token character varying NOT NULL,
    order_id integer NOT NULL,
    type public.enum_tickets_type DEFAULT 'adult'::public.enum_tickets_type NOT NULL,
    status public.enum_tickets_status DEFAULT 'active'::public.enum_tickets_status NOT NULL,
    cancelled_at timestamp(3) with time zone,
    cancel_reason public.enum_tickets_cancel_reason,
    scanned boolean DEFAULT false,
    scanned_at timestamp(3) with time zone,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.tickets_id_seq OWNED BY public.tickets.id;

CREATE TABLE IF NOT EXISTS public.users (
    id integer NOT NULL,
    role public.enum_users_role DEFAULT 'admin'::public.enum_users_role NOT NULL,
    partner_id integer,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    email character varying,
    username character varying NOT NULL,
    reset_password_token character varying,
    reset_password_expiration timestamp(3) with time zone,
    salt character varying,
    hash character varying,
    login_attempts numeric DEFAULT 0,
    lock_until timestamp(3) with time zone
);

CREATE SEQUENCE IF NOT EXISTS public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

CREATE TABLE IF NOT EXISTS public.users_sessions (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    created_at timestamp(3) with time zone,
    expires_at timestamp(3) with time zone NOT NULL
);

ALTER TABLE ONLY public.contact_submissions ALTER COLUMN id SET DEFAULT nextval('public.contact_submissions_id_seq'::regclass);

ALTER TABLE ONLY public.order_lookups ALTER COLUMN id SET DEFAULT nextval('public.order_lookups_id_seq'::regclass);

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);

ALTER TABLE ONLY public.partners ALTER COLUMN id SET DEFAULT nextval('public.partners_id_seq'::regclass);

ALTER TABLE ONLY public.members ALTER COLUMN id SET DEFAULT nextval('public.members_id_seq'::regclass);

ALTER TABLE ONLY public.payload_kv ALTER COLUMN id SET DEFAULT nextval('public.payload_kv_id_seq'::regclass);

ALTER TABLE ONLY public.payload_locked_documents ALTER COLUMN id SET DEFAULT nextval('public.payload_locked_documents_id_seq'::regclass);

ALTER TABLE ONLY public.payload_locked_documents_rels ALTER COLUMN id SET DEFAULT nextval('public.payload_locked_documents_rels_id_seq'::regclass);

ALTER TABLE ONLY public.payload_migrations ALTER COLUMN id SET DEFAULT nextval('public.payload_migrations_id_seq'::regclass);

ALTER TABLE ONLY public.payload_preferences ALTER COLUMN id SET DEFAULT nextval('public.payload_preferences_id_seq'::regclass);

ALTER TABLE ONLY public.payload_preferences_rels ALTER COLUMN id SET DEFAULT nextval('public.payload_preferences_rels_id_seq'::regclass);

ALTER TABLE ONLY public.posts ALTER COLUMN id SET DEFAULT nextval('public.posts_id_seq'::regclass);

ALTER TABLE ONLY public.shows ALTER COLUMN id SET DEFAULT nextval('public.shows_id_seq'::regclass);

ALTER TABLE ONLY public.tickets ALTER COLUMN id SET DEFAULT nextval('public.tickets_id_seq'::regclass);

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_submissions_pkey' AND conrelid = 'public.contact_submissions'::regclass) THEN
    ALTER TABLE ONLY public.contact_submissions
    ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lookups_pkey' AND conrelid = 'public.order_lookups'::regclass) THEN
    ALTER TABLE ONLY public.order_lookups
    ADD CONSTRAINT order_lookups_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_pkey' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_pkey' AND conrelid = 'public.partners'::regclass) THEN
    ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_pkey' AND conrelid = 'public.members'::regclass) THEN
    ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_kv_pkey' AND conrelid = 'public.payload_kv'::regclass) THEN
    ALTER TABLE ONLY public.payload_kv
    ADD CONSTRAINT payload_kv_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_pkey' AND conrelid = 'public.payload_locked_documents'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents
    ADD CONSTRAINT payload_locked_documents_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_pkey' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_migrations_pkey' AND conrelid = 'public.payload_migrations'::regclass) THEN
    ALTER TABLE ONLY public.payload_migrations
    ADD CONSTRAINT payload_migrations_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_pkey' AND conrelid = 'public.payload_preferences'::regclass) THEN
    ALTER TABLE ONLY public.payload_preferences
    ADD CONSTRAINT payload_preferences_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_rels_pkey' AND conrelid = 'public.payload_preferences_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_pkey' AND conrelid = 'public.posts'::regclass) THEN
    ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shows_pkey' AND conrelid = 'public.shows'::regclass) THEN
    ALTER TABLE ONLY public.shows
    ADD CONSTRAINT shows_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_pkey' AND conrelid = 'public.tickets'::regclass) THEN
    ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pkey' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_sessions_pkey' AND conrelid = 'public.users_sessions'::regclass) THEN
    ALTER TABLE ONLY public.users_sessions
    ADD CONSTRAINT users_sessions_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contact_submissions_created_at_idx ON public.contact_submissions USING btree (created_at);

CREATE INDEX IF NOT EXISTS contact_submissions_updated_at_idx ON public.contact_submissions USING btree (updated_at);

CREATE INDEX IF NOT EXISTS order_lookups_created_at_idx ON public.order_lookups USING btree (created_at);

CREATE INDEX IF NOT EXISTS order_lookups_show_idx ON public.order_lookups USING btree (show_id);

CREATE INDEX IF NOT EXISTS order_lookups_updated_at_idx ON public.order_lookups USING btree (updated_at);

CREATE INDEX IF NOT EXISTS order_lookups_user_idx ON public.order_lookups USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS orders_code_idx ON public.orders USING btree (code);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders USING btree (created_at);

CREATE INDEX IF NOT EXISTS orders_partner_idx ON public.orders USING btree (partner_id);

CREATE INDEX IF NOT EXISTS orders_member_idx ON public.orders USING btree (member_id);

CREATE INDEX IF NOT EXISTS orders_show_idx ON public.orders USING btree (show_id);

CREATE INDEX IF NOT EXISTS orders_updated_at_idx ON public.orders USING btree (updated_at);

CREATE INDEX IF NOT EXISTS partners_created_at_idx ON public.partners USING btree (created_at);

CREATE INDEX IF NOT EXISTS partners_updated_at_idx ON public.partners USING btree (updated_at);

CREATE INDEX IF NOT EXISTS members_created_at_idx ON public.members USING btree (created_at);

CREATE INDEX IF NOT EXISTS members_updated_at_idx ON public.members USING btree (updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS payload_kv_key_idx ON public.payload_kv USING btree (key);

CREATE INDEX IF NOT EXISTS payload_locked_documents_created_at_idx ON public.payload_locked_documents USING btree (created_at);

CREATE INDEX IF NOT EXISTS payload_locked_documents_global_slug_idx ON public.payload_locked_documents USING btree (global_slug);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_contact_submissions_id_idx ON public.payload_locked_documents_rels USING btree (contact_submissions_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_order_idx ON public.payload_locked_documents_rels USING btree ("order");

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_order_lookups_id_idx ON public.payload_locked_documents_rels USING btree (order_lookups_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_orders_id_idx ON public.payload_locked_documents_rels USING btree (orders_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_parent_idx ON public.payload_locked_documents_rels USING btree (parent_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_partners_id_idx ON public.payload_locked_documents_rels USING btree (partners_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_members_id_idx ON public.payload_locked_documents_rels USING btree (members_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_path_idx ON public.payload_locked_documents_rels USING btree (path);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_posts_id_idx ON public.payload_locked_documents_rels USING btree (posts_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_shows_id_idx ON public.payload_locked_documents_rels USING btree (shows_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_tickets_id_idx ON public.payload_locked_documents_rels USING btree (tickets_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_users_id_idx ON public.payload_locked_documents_rels USING btree (users_id);

CREATE INDEX IF NOT EXISTS payload_locked_documents_updated_at_idx ON public.payload_locked_documents USING btree (updated_at);

CREATE INDEX IF NOT EXISTS payload_migrations_created_at_idx ON public.payload_migrations USING btree (created_at);

CREATE INDEX IF NOT EXISTS payload_migrations_updated_at_idx ON public.payload_migrations USING btree (updated_at);

CREATE INDEX IF NOT EXISTS payload_preferences_created_at_idx ON public.payload_preferences USING btree (created_at);

CREATE INDEX IF NOT EXISTS payload_preferences_key_idx ON public.payload_preferences USING btree (key);

CREATE INDEX IF NOT EXISTS payload_preferences_rels_order_idx ON public.payload_preferences_rels USING btree ("order");

CREATE INDEX IF NOT EXISTS payload_preferences_rels_parent_idx ON public.payload_preferences_rels USING btree (parent_id);

CREATE INDEX IF NOT EXISTS payload_preferences_rels_path_idx ON public.payload_preferences_rels USING btree (path);

CREATE INDEX IF NOT EXISTS payload_preferences_rels_users_id_idx ON public.payload_preferences_rels USING btree (users_id);

CREATE INDEX IF NOT EXISTS payload_preferences_updated_at_idx ON public.payload_preferences USING btree (updated_at);

CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts USING btree (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_idx ON public.posts USING btree (slug);

CREATE INDEX IF NOT EXISTS posts_updated_at_idx ON public.posts USING btree (updated_at);

CREATE INDEX IF NOT EXISTS shows_created_at_idx ON public.shows USING btree (created_at);

CREATE INDEX IF NOT EXISTS shows_updated_at_idx ON public.shows USING btree (updated_at);

CREATE INDEX IF NOT EXISTS shows_venue_changed_by_idx ON public.shows USING btree (venue_changed_by_id);

CREATE INDEX IF NOT EXISTS shows_date_changed_by_idx ON public.shows USING btree (date_changed_by_id);

CREATE INDEX IF NOT EXISTS tickets_created_at_idx ON public.tickets USING btree (created_at);

CREATE INDEX IF NOT EXISTS tickets_order_idx ON public.tickets USING btree (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS tickets_token_idx ON public.tickets USING btree (token);

CREATE INDEX IF NOT EXISTS tickets_updated_at_idx ON public.tickets USING btree (updated_at);

CREATE INDEX IF NOT EXISTS users_created_at_idx ON public.users USING btree (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON public.users USING btree (email);

CREATE INDEX IF NOT EXISTS users_partner_idx ON public.users USING btree (partner_id);

CREATE INDEX IF NOT EXISTS users_sessions_order_idx ON public.users_sessions USING btree (_order);

CREATE INDEX IF NOT EXISTS users_sessions_parent_id_idx ON public.users_sessions USING btree (_parent_id);

CREATE INDEX IF NOT EXISTS users_updated_at_idx ON public.users USING btree (updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON public.users USING btree (username);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lookups_show_id_shows_id_fk' AND conrelid = 'public.order_lookups'::regclass) THEN
    ALTER TABLE ONLY public.order_lookups
    ADD CONSTRAINT order_lookups_show_id_shows_id_fk FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lookups_user_id_users_id_fk' AND conrelid = 'public.order_lookups'::regclass) THEN
    ALTER TABLE ONLY public.order_lookups
    ADD CONSTRAINT order_lookups_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_partner_id_partners_id_fk' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_partner_id_partners_id_fk FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_member_id_members_id_fk' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_member_id_members_id_fk FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_show_id_shows_id_fk' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_show_id_shows_id_fk FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_contact_submissions_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_contact_submissions_fk FOREIGN KEY (contact_submissions_id) REFERENCES public.contact_submissions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_order_lookups_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_order_lookups_fk FOREIGN KEY (order_lookups_id) REFERENCES public.order_lookups(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_orders_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_orders_fk FOREIGN KEY (orders_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_parent_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.payload_locked_documents(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_partners_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_partners_fk FOREIGN KEY (partners_id) REFERENCES public.partners(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_members_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_members_fk FOREIGN KEY (members_id) REFERENCES public.members(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_posts_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_posts_fk FOREIGN KEY (posts_id) REFERENCES public.posts(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_shows_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_shows_fk FOREIGN KEY (shows_id) REFERENCES public.shows(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_tickets_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_tickets_fk FOREIGN KEY (tickets_id) REFERENCES public.tickets(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_users_fk' AND conrelid = 'public.payload_locked_documents_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_users_fk FOREIGN KEY (users_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_rels_parent_fk' AND conrelid = 'public.payload_preferences_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.payload_preferences(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_rels_users_fk' AND conrelid = 'public.payload_preferences_rels'::regclass) THEN
    ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_users_fk FOREIGN KEY (users_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shows_venue_changed_by_id_users_id_fk' AND conrelid = 'public.shows'::regclass) THEN
    ALTER TABLE ONLY public.shows
    ADD CONSTRAINT shows_venue_changed_by_id_users_id_fk FOREIGN KEY (venue_changed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shows_date_changed_by_id_users_id_fk' AND conrelid = 'public.shows'::regclass) THEN
    ALTER TABLE ONLY public.shows
    ADD CONSTRAINT shows_date_changed_by_id_users_id_fk FOREIGN KEY (date_changed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_order_id_orders_id_fk' AND conrelid = 'public.tickets'::regclass) THEN
    ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_partner_id_partners_id_fk' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_partner_id_partners_id_fk FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_sessions_parent_id_fk' AND conrelid = 'public.users_sessions'::regclass) THEN
    ALTER TABLE ONLY public.users_sessions
    ADD CONSTRAINT users_sessions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;
