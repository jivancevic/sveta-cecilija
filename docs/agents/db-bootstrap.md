# Database bootstrap (schema management)

## How schema reaches production

`scripts/bootstrap-db.mjs` runs before `next start` (see `package.json`'s
`"start"` script). It connects to `DATABASE_URL` and applies every
`*.sql` file in `db/schema/` in alphabetical order. Every statement is
idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF
NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`), so re-running
is safe.

Local dev does **not** run this script — Payload's `push: true` (gated
on `NODE_ENV !== 'production'`) auto-syncs the schema for you.

## When you add a new collection or column

1. Make the change in `src/collections/<Collection>.ts` as usual.
2. Restart `npm run dev` — Payload's auto-push creates the new
   table/column in your local Postgres. Confirm with `\d <table>`.
3. Append the equivalent idempotent SQL to `db/schema/app.sql`:
   - new column → `ALTER TABLE <t> ADD COLUMN IF NOT EXISTS …`
   - new enum value → `ALTER TYPE <enum> ADD VALUE IF NOT EXISTS '<v>'`
   - new enum → `DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
   - new collection → `CREATE TABLE IF NOT EXISTS <t> ( … )`
4. Test the SQL by running it against your local DB twice — should be a
   no-op the second time.
5. Commit. On the next Coolify deploy the start script will apply it
   before the new server boots.

To verify Payload's actual column types/defaults for the SQL you're
writing, dump from your local dev DB:

```sh
PGPASSWORD=postgres psql -h localhost -U postgres -d sveta_cecilija -c "\d <table>"
```

## Why not `payload migrate`?

Payload's CLI loader uses tsx with strict ESM resolution, which can't
resolve this codebase's bundler-style imports (no `.js` extensions).
Adding extensions everywhere is invasive, and the migration system's
sequential semantics are overkill for one developer shipping
infrequently. The bootstrap script gets us the same outcome — schema
in sync on every deploy — without coupling to Payload's CLI internals.

If the project ever needs down-migrations, schema diffs, or branching
schema timelines, switch to `payload migrate` (and add `.js`
extensions to every import in `src/payload.config.ts` and the files it
loads).

## Recovering from a stuck deploy

If `bootstrap-db.mjs` fails on startup, the container won't start.
Symptoms in Coolify logs: `[bootstrap-db] failed: <error>`. Common
causes:

- `DATABASE_URL not set` → log line `[bootstrap-db] DATABASE_URL is not set — skipping`, container starts anyway. Set it in Coolify env.
- `relation "shows" does not exist` → the original Payload tables were never created. Run the very first Payload deploy's auto-push manually, or seed by running `\i db/schema/app.sql` from psql after creating `shows` by hand.
- `column already exists` → not possible (the script uses `IF NOT EXISTS`); if you see this, a manual `ALTER TABLE` outside the script created a column with a different type. Reconcile manually.
