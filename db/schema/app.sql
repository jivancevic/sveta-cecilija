-- App-managed schema for moreska.eu (Shows, Orders, Tickets).
--
-- Idempotent — safe to run on every container startup. Applied by
-- scripts/bootstrap-db.mjs before `next start`.
--
-- Payload owns the rest of the schema (users, payload_*, contact_submissions);
-- in dev `push: true` auto-creates them, in prod they were created by an
-- earlier deploy when Payload's push was still effective.
--
-- When you add a new collection or column, append the corresponding
-- CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- statement here. Do not overwrite or reorder existing statements.

-- ─── enums ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE enum_shows_venue AS ENUM ('ljetno-kino', 'zimsko-kino');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enum_shows_status AS ENUM ('active', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enum_orders_refund_status AS ENUM ('none', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enum_users_role AS ENUM ('admin', 'door-staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Per-person ticket model (ADR-0007) + partner channel (ADR-0008).
DO $$ BEGIN
  CREATE TYPE enum_tickets_type AS ENUM ('adult', 'child');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enum_tickets_status AS ENUM ('active', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enum_tickets_cancel_reason AS ENUM ('storno', 'refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enum_orders_channel AS ENUM ('online', 'partner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── qr_tokens → tickets rename (ADR-0007) ──────────────────────────────
-- The collection/table is renamed from qr_tokens to tickets. This block runs
-- on an EXISTING DB (prod, or a dev DB booted before this change) where the
-- old table still exists; it MUST precede the `CREATE TABLE IF NOT EXISTS
-- tickets` below, or that create would make a fresh empty table and orphan the
-- rename. On a fresh DB the whole bootstrap is skipped (see bootstrap-db.mjs)
-- and instrumentation.ts creates `tickets` directly. Idempotent: once renamed,
-- qr_tokens is gone and the guard is a no-op.
DO $$ BEGIN
  IF to_regclass('public.qr_tokens') IS NOT NULL AND to_regclass('public.tickets') IS NULL THEN
    ALTER TABLE qr_tokens RENAME TO tickets;
  END IF;
END $$;

ALTER INDEX IF EXISTS qr_tokens_token_idx      RENAME TO tickets_token_idx;
ALTER INDEX IF EXISTS qr_tokens_created_at_idx RENAME TO tickets_created_at_idx;

-- Payload's relations table keys each relationship by `<slug>_id`; the slug
-- changed from qr-tokens to tickets, so qr_tokens_id becomes tickets_id.
DO $$ BEGIN
  IF to_regclass('public.payload_locked_documents_rels') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'qr_tokens_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'tickets_id')
  THEN
    ALTER TABLE payload_locked_documents_rels RENAME COLUMN qr_tokens_id TO tickets_id;
  END IF;
END $$;

-- ─── users ────────────────────────────────────────────────────────────
-- Auth table owned by Payload; we only add the role column. Existing rows
-- default to 'admin' so existing accounts keep their current capabilities.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role enum_users_role NOT NULL DEFAULT 'admin';

-- ─── shows ────────────────────────────────────────────────────────────
-- Table exists from the original deploy; only the post-#4 columns need
-- to be added.

ALTER TABLE shows ADD COLUMN IF NOT EXISTS venue          enum_shows_venue  NOT NULL DEFAULT 'ljetno-kino';
ALTER TABLE shows ADD COLUMN IF NOT EXISTS online_sold    numeric                    DEFAULT 0;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS in_person_sold numeric                    DEFAULT 0;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS status         enum_shows_status NOT NULL DEFAULT 'active';

-- Tickets reserved on the previous WordPress site (korcula-moreska.com) before
-- the moreska.eu cutover. Subtracted from venue capacity so the new booking
-- flow doesn't oversell against legacy holders. Admin-edited; mostly static
-- post-cutover (only changes if a legacy buyer is refunded by the old operator).
ALTER TABLE shows ADD COLUMN IF NOT EXISTS legacy_reserved integer NOT NULL DEFAULT 0 CHECK (legacy_reserved >= 0);

-- ─── orders ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id                       serial PRIMARY KEY,
  buyer_name               varchar  NOT NULL,
  email                    varchar  NOT NULL,
  adult_count              numeric  NOT NULL,
  child_count              numeric  NOT NULL,
  total                    numeric  NOT NULL,
  stripe_payment_intent_id varchar,
  refund_status            enum_orders_refund_status NOT NULL DEFAULT 'none',
  show_id                  integer  NOT NULL REFERENCES shows(id),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- Buyer locale captured at checkout time so post-purchase emails
-- (review request, future buyer comms) render in the right language
-- without depending on Stripe metadata at send time.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS locale varchar(2);

-- Idempotency marker for the T+24h post-show review email.
-- An atomic `UPDATE … WHERE review_email_sent_at IS NULL RETURNING …`
-- guarantees at-most-once send under concurrent cron invocations.
-- See src/lib/review-email/*.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_email_sent_at timestamptz;

-- Per-person tickets + partner channel (ADR-0007/0008).
-- `code`: short human order reference (printed on partner slips, read at door).
--   UNIQUE allows multiple NULLs, so legacy rows without a code don't collide.
-- `channel`: online (Stripe) vs partner (POS); drives pricing + invoicing.
-- `partner_id`: nullable; the partners collection + FK land in #143. Kept as a
--   plain integer for now so Payload's number field (Orders.partnerId) matches.
-- buyer_name/email become nullable: a partner POS sale has no buyer PII.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS code       varchar UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel    enum_orders_channel NOT NULL DEFAULT 'online';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS partner_id integer;
ALTER TABLE orders ALTER COLUMN buyer_name DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN email      DROP NOT NULL;

-- ─── tickets (was qr_tokens; renamed above for existing DBs) ────────────
-- One row per person (ADR-0007). On a fresh DB this CREATE makes the table;
-- on an existing DB the rename above already produced it and this is a no-op,
-- with the ADD COLUMNs below widening it to the per-person shape.

CREATE TABLE IF NOT EXISTS tickets (
  id          serial PRIMARY KEY,
  token       varchar  NOT NULL UNIQUE,
  order_id    integer  NOT NULL REFERENCES orders(id),
  type        enum_tickets_type   NOT NULL DEFAULT 'adult',
  status      enum_tickets_status NOT NULL DEFAULT 'active',
  cancelled_at  timestamptz,
  cancel_reason enum_tickets_cancel_reason,
  scanned     boolean             DEFAULT false,
  scanned_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Widen a renamed (legacy) tickets table to the per-person shape. `type` gets a
-- DEFAULT so the NOT NULL succeeds on any pre-existing rows (those are one-per-
-- order test tokens; wipe them manually post-deploy — see PR notes).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS type          enum_tickets_type   NOT NULL DEFAULT 'adult';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status        enum_tickets_status NOT NULL DEFAULT 'active';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancel_reason enum_tickets_cancel_reason;

-- ─── posts (blog) ─────────────────────────────────────────────────────
-- Blog posts authored in Payload admin. body is lexical JSON; the rest
-- mirrors the collection fields in src/collections/Posts.ts.

DO $$ BEGIN
  CREATE TYPE enum_posts_locale AS ENUM ('en', 'hr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enum_posts_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS posts (
  id                 serial PRIMARY KEY,
  title              varchar  NOT NULL,
  slug               varchar  NOT NULL UNIQUE,
  locale             enum_posts_locale NOT NULL DEFAULT 'en',
  excerpt            varchar  NOT NULL,
  hero_image         varchar  NOT NULL,
  hero_image_alt     varchar,
  body               jsonb    NOT NULL,
  published_at       timestamptz NOT NULL,
  updated_at_public  timestamptz,
  status             enum_posts_status NOT NULL DEFAULT 'draft',
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_locale_status_published_at_idx
  ON posts (locale, status, published_at DESC);

-- ─── payload_locked_documents_rels: posts_id ──────────────────────────
-- When Posts (#41) was added, the rels-table create in
-- src/instrumentation.ts was not updated. Existing prod DBs only run
-- CREATE TABLE IF NOT EXISTS, so they never gained posts_id. Every
-- payload.findByID / payload.find then errors with "column posts_id
-- does not exist", which silently breaks the Stripe webhook's ticket
-- email and any admin lookup.

ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS posts_id integer;

DO $$ BEGIN
  ALTER TABLE payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_posts_fk
    FOREIGN KEY (posts_id) REFERENCES posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── order_lookups (audit) ────────────────────────────────────────────
-- Door-side ticket-lookup audit log (#87). Tehnika has read scope into
-- orders via the lookup API; every search is recorded here for admin
-- review.

DO $$ BEGIN
  CREATE TYPE enum_order_lookups_mode AS ENUM ('email', 'name');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS order_lookups (
  id              serial PRIMARY KEY,
  user_id         integer REFERENCES users(id),
  show_id         integer REFERENCES shows(id),
  query           varchar,
  mode            enum_order_lookups_mode,
  matched_order_id varchar,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_lookups_created_at_idx
  ON order_lookups (created_at DESC);

-- ─── payload_locked_documents_rels: order_lookups_id ──────────────────
-- Same trap as posts_id above: when OrderLookups was added (#87) the
-- rels-table create in src/instrumentation.ts wasn't updated. Existing
-- prod DBs only run CREATE TABLE IF NOT EXISTS, so they never gained
-- order_lookups_id. Payload's session-lock query references it on every
-- SSR page → checkout 500s.

ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS order_lookups_id integer;

DO $$ BEGIN
  ALTER TABLE payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_order_lookups_fk
    FOREIGN KEY (order_lookups_id) REFERENCES order_lookups(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
