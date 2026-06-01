export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { Client } = await import('pg')

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    await client.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "email" varchar NOT NULL,
        "reset_password_token" varchar,
        "reset_password_expiration" timestamp(3) with time zone,
        "salt" varchar,
        "hash" varchar,
        "login_attempts" numeric DEFAULT 0,
        "lock_until" timestamp(3) with time zone
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");
      CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" ("created_at");

      CREATE TABLE IF NOT EXISTS "users_sessions" (
        "_order" integer NOT NULL,
        "_parent_id" integer NOT NULL,
        "id" varchar PRIMARY KEY NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "expires_at" timestamp(3) with time zone,
        CONSTRAINT "users_sessions_parent_fk" FOREIGN KEY ("_parent_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "users_sessions_order_idx" ON "users_sessions" ("_order");
      CREATE INDEX IF NOT EXISTS "users_sessions_parent_id_idx" ON "users_sessions" ("_parent_id");

      CREATE TABLE IF NOT EXISTS "shows" (
        "id" serial PRIMARY KEY NOT NULL,
        "date" timestamp(3) with time zone,
        "time" varchar,
        "capacity" numeric,
        "online_sold" numeric DEFAULT 0,
        "in_person_sold" numeric DEFAULT 0,
        "status" varchar DEFAULT 'active',
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "shows_created_at_idx" ON "shows" ("created_at");

      CREATE TABLE IF NOT EXISTS "orders" (
        "id" serial PRIMARY KEY NOT NULL,
        "code" varchar,
        "channel" varchar DEFAULT 'online',
        "partner_id" integer,
        "buyer_name" varchar,
        "email" varchar,
        "adult_count" numeric,
        "child_count" numeric,
        "total" numeric,
        "stripe_payment_intent_id" varchar,
        "refund_status" varchar DEFAULT 'none',
        "show_id" integer,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "orders_show_fk" FOREIGN KEY ("show_id") REFERENCES "shows"("id")
      );
      CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders" ("created_at");

      CREATE TABLE IF NOT EXISTS "tickets" (
        "id" serial PRIMARY KEY NOT NULL,
        "token" varchar,
        "order_id" integer,
        "type" varchar DEFAULT 'adult',
        "status" varchar DEFAULT 'active',
        "cancelled_at" timestamp(3) with time zone,
        "cancel_reason" varchar,
        "scanned" boolean DEFAULT false,
        "scanned_at" timestamp(3) with time zone,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "tickets_order_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "tickets_token_idx" ON "tickets" ("token");
      CREATE INDEX IF NOT EXISTS "tickets_created_at_idx" ON "tickets" ("created_at");

      CREATE TABLE IF NOT EXISTS "contact_submissions" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar,
        "email" varchar,
        "enquiry_type" varchar,
        "message" varchar,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "contact_submissions_created_at_idx" ON "contact_submissions" ("created_at");

      CREATE TABLE IF NOT EXISTS "payload_preferences" (
        "id" serial PRIMARY KEY NOT NULL,
        "key" varchar,
        "value" jsonb,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences" ("key");
      CREATE INDEX IF NOT EXISTS "payload_preferences_created_at_idx" ON "payload_preferences" ("created_at");

      CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL,
        "path" varchar NOT NULL,
        "users_id" integer,
        CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload_preferences"("id") ON DELETE CASCADE,
        CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_order_idx" ON "payload_preferences_rels" ("order");
      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" ("parent_id");
      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels" ("path");
      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" ("users_id");

      CREATE TABLE IF NOT EXISTS "payload_migrations" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar,
        "batch" numeric,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "payload_migrations_created_at_idx" ON "payload_migrations" ("created_at");

      CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
        "id" serial PRIMARY KEY NOT NULL,
        "global_slug" varchar,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" ("global_slug");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_created_at_idx" ON "payload_locked_documents" ("created_at");

      CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL,
        "path" varchar NOT NULL,
        "users_id" integer,
        "shows_id" integer,
        "orders_id" integer,
        "tickets_id" integer,
        "contact_submissions_id" integer,
        "posts_id" integer,
        "order_lookups_id" integer,
        CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload_locked_documents"("id") ON DELETE CASCADE,
        CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "payload_locked_documents_rels_shows_fk" FOREIGN KEY ("shows_id") REFERENCES "shows"("id") ON DELETE CASCADE,
        CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "payload_locked_documents_rels_tickets_fk" FOREIGN KEY ("tickets_id") REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "payload_locked_documents_rels_contact_submissions_fk" FOREIGN KEY ("contact_submissions_id") REFERENCES "contact_submissions"("id") ON DELETE CASCADE,
        CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "posts"("id") ON DELETE CASCADE,
        CONSTRAINT "payload_locked_documents_rels_order_lookups_fk" FOREIGN KEY ("order_lookups_id") REFERENCES "order_lookups"("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" ("order");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" ("parent_id");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" ("path");
    `)
    console.log('[bootstrap] Database schema ready.')
  } catch (err) {
    console.error('[bootstrap] Schema init failed:', err)
  } finally {
    await client.end()
  }
}
