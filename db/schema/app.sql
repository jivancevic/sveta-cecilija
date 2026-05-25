-- App-managed schema for moreska.eu (Shows, Orders, QRTokens).
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

-- ─── qr_tokens ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qr_tokens (
  id          serial PRIMARY KEY,
  token       varchar  NOT NULL UNIQUE,
  order_id    integer  NOT NULL REFERENCES orders(id),
  scanned     boolean             DEFAULT false,
  scanned_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
