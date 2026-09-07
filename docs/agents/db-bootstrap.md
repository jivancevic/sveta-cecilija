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
PGPASSWORD=postgres psql -h localhost -U postgres -d sveta_cecilija_dev -c "\d <table>"
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

## A vitest guardrail protects the schema files

`src/lib/db-schema-safety.test.ts` fails on any unguarded `UPDATE`/`DELETE`/`TRUNCATE` in `db/schema/*.sql` — added after PR #126 caught one zeroing the sold counters on every deploy. Keep destructive statements guarded (or out of the schema files entirely).

`TRUNCATE` on any Payload collection table needs `CASCADE` — `payload_locked_documents_rels` FKs cause a prod 502 crashloop otherwise.

## Enum migrations need ordering care AND a file split

When you change a Payload `select` field's options, the underlying Postgres enum (`enum_<table>_<field>`) must be widened *before* any SQL UPDATE references the new values. Two gotchas stack:

1. **`ALTER TYPE … ADD VALUE` cannot be used within the same transaction that references the new value** — Postgres errors with `unsafe use of new value of enum type`. `IF NOT EXISTS` doesn't help; that's about idempotency, not transaction scoping.
2. **`bootstrap-db.mjs` sends each `.sql` file as a single `client.query(sql)` call** — pg's simple query protocol treats multi-statement strings as one implicit transaction. So `ALTER TYPE ADD VALUE` and a downstream `UPDATE` cannot share a file.

Pattern: split into two files that run alphabetically. The `-1-` file contains only `ALTER TYPE <enum> ADD VALUE IF NOT EXISTS '<value>';` (one statement per new value, no DO block); the `-2-` file contains the `UPDATE`/`INSERT` statements. Each runs in its own implicit transaction, so the new enum values are visible by the time step 2 runs. See `db/schema/migrate-permissions-1-schema.sql` and `migrate-permissions-2-data.sql` for the working pattern. (The original example, `migrate-roles-1-enum.sql` / `-2-data.sql`, was deleted in #398 along with the role column.)

In dev, Payload's `push: true` will subsequently rewrite the enum to match the field config and `ALTER COLUMN … USING <cast>` — the cast fails if any row still holds a value not in the new enum, so always migrate data *first*.

## Cross-table FK migrations must be NAMED to sort after the table they reference

Files apply in `readdirSync().sort()` (alphabetical) order with no dependency resolution. A migration that adds a foreign key to another table must have a filename that sorts *after* the file that `CREATE TABLE`s the referenced table — otherwise, on an *existing* prod/staging DB, the FK statement runs first and dies with `relation "<table>" does not exist`. The container exits 1 and restart-loops, so Traefik serves a site-wide 503. **Fresh DBs are immune** (`00-base.sql` builds every table up front, so the FK file is a no-op), and CI's fresh-DB build + drift checks pass — this bug only surfaces on a populated DB at deploy time.

This is *not* the idempotency rule (the statements were correctly `IF NOT EXISTS`-guarded); it's a first-run ordering failure. Idempotency saves you on the *second* run; ordering must be right on the *first*.

**Outage 2026-07-07 (#328 comp/promo):** `migrate-comp-orders-member.sql` (FK → `members`) and `migrate-orders-promo-code.sql` (FK → `promo_codes`) both sorted *before* the files creating those tables. Fixed by renaming to `migrate-orders-member.sql` (#330) and `migrate-promo-orders.sql` (#331) so they sort last. **Beware the dash trap:** `foo-bar-x.sql` sorts *before* `foo-bar.sql` because `-` (0x2d) < `.` (0x2e) — so do **not** name the dependent file `<table>-<suffix>.sql` (e.g. `promo-codes-orders.sql` would still sort before `promo-codes.sql`). When adding an FK migration, hand-check the full `ls db/schema/*.sql | sort` order and add an `ORDERING:` note to the file header (see `migrate-orders-member.sql`).

**Defensive WHERE comparisons against removed enum values.** Once Payload's `push:true` rewrites an enum to drop an old label (`'door-staff'` → `'tehnika'` was the case that bit), any later run of the same data migration crashes with `invalid input value for enum <type>: "door-staff"`. Postgres coerces the RHS literal of `WHERE col = 'door-staff'` to the column's enum type at *parse* time, so the script fails before it can check whether any row still needs migrating. Fix: cast the column to text — `WHERE col::text = 'door-staff'`. The migration stays idempotent on fresh DBs (no rows match, no-op) and still does the right thing on DBs that haven't been re-pushed yet.

**Dropping a column that other migration files still read.** Same class of problem one level up: `bootstrap-db.mjs` re-applies *every* file on *every* restart, so a `DROP COLUMN` breaks each earlier file that names it. Two rules, both proven by the `users.role` drop (#398, `migrate-zz-drop-users-role.sql`): (1) name the drop so it sorts **last** among `migrate-*` — every file that still needs the old data must run before it, or a DB upgraded straight from an old image loses the data before it is translated; (2) wrap each remaining reader in an `information_schema.columns` existence check **and run its statements through `EXECUTE`**, because a plain statement inside a false `IF` is still a parse risk while a dynamic string is never parsed at all. Then a fresh DB (whose `00-base.sql` never had the column) and a post-drop DB both no-op cleanly. `src/lib/db-schema-safety.test.ts` asserts both rules.

**Dropping `required` or `defaultValue` from a Payload field IS a schema change.** The db-postgres adapter derives `NOT NULL` from `required` and the column `DEFAULT` from `defaultValue`, so a field-config-only edit still moves the drift gate. Verified on the legacy `Users.role` field (#397): push emitted a bare `role public.enum_users_role`, one drifting line against `00-base.sql`, fixed with an `ALTER COLUMN … DROP DEFAULT` / `DROP NOT NULL` migration plus the matching base-schema edit. Removing a field entirely moves it the same way (#398: the column and its enum both leave `00-base.sql`). Reproduce the gate locally the way CI does: two throwaway DBs on one server, `next dev` into one (Payload push) and `bootstrap-db.mjs` into the other, `pg_dump --schema-only` both, `node scripts/schema-diff.mjs expected.sql bootstrap.sql`. Point `.env.local` at the throwaway DB rather than the shell env, because Next 16 loads `.env.local` over it.

**`npm run dev` runs `bootstrap-db.mjs`**, but only if `DATABASE_URL` is in the shell env. `next dev` itself loads `.env.local`, but standalone node scripts don't. If bootstrap prints `DATABASE_URL is not set — skipping`, source env first: `set -a && . .env.local && set +a && npm run dev`. A fresh clone hitting an enum-change migration will 500 until this is done.

## Cross-table FK migrations must sort AFTER the table they reference

`bootstrap-db.mjs` applies `db/schema/*.sql` in pure alphabetical filename order (`readdirSync().sort()`), with no declared dependencies. A migration that adds a **foreign key to a table created by another migration** must have a filename that sorts *after* that table's file, or an existing prod/staging DB fails `relation "<table>" does not exist`, the container exits 1 and restart-loops, and Traefik serves a site-wide 503.

Fresh DBs are immune — `00-base.sql` builds every object up front and all `migrate-*` files become idempotent no-ops — so **CI (fresh DB), `npm run build`, and the `drift` gate all pass while this bug ships**. It only bites the ordered application of deltas onto a DB that predates them. This is what happened to the comp/promo group (#328): `migrate-comp-orders-member.sql` (FK → `members`) and `migrate-orders-promo-code.sql` (FK → `promo_codes`) both sorted before the files creating those tables → prod outage, fixed by renames in #330/#331.

Rules of thumb:
- Name the dependent file so it sorts after its dependency, e.g. `migrate-members.sql` → `migrate-orders-member.sql` (not `migrate-comp-orders-member.sql`, which sorts *before* `migrate-members`).
- **The dash trap:** `-` (0x2d) sorts before `.` (0x2e), so `foo-bar-x.sql` runs *before* `foo-bar.sql`. Never name a dependent file `<table>-<thing>.sql`.
- Verify the sorted order by hand and add an `ORDERING:` note to the dependent file's header.

## Atomic DB writes when a field accumulates

When an API endpoint adds-to a numeric column (`inPersonSold`, `onlineSold`, etc.) instead of replacing it, **never** do `find` → compute → `update` — that read-modify-write loses updates under concurrent requests. Use a single SQL statement via the underlying pool:

```ts
const db = (payload.db as unknown as { pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> } }).pool
const res = await db.query(
  'UPDATE shows SET in_person_sold = COALESCE(in_person_sold, 0) + $1, updated_at = NOW() WHERE id = $2 RETURNING in_person_sold',
  [delta, Number(showId)],
)
```

Pattern proven in `src/app/api/shows/[id]/in-person-sales/route.ts`. The lib helper takes an `atomicIncrement` dep so unit tests can mock it; only the route wires the real SQL.

## Reading date/timestamp columns via raw SQL → JS Date, not string

node-postgres parses `date` / `timestamptz` columns into **JS `Date` objects**, not strings. `String(row.date).slice(0,10)` then yields `"Mon Jun 22"` (not `2026-06-22`), which renders as **"Invalid Date"** anywhere it's parsed downstream. Normalise with **`toIsoDate()`** (`src/lib/to-iso-date.ts`) when you need a `YYYY-MM-DD` from a raw `pool.query`/drizzle row. (Shows are stored at noon UTC, so the UTC calendar day is the intended day.) Bit the reschedule notice's struck-through old date before the fix.

## Raw SQL for race-sensitive ops (first-one-wins)

Payload's `find`/`update` are read-then-write under the hood and not safe for "first-one-wins" semantics. For atomic mark-and-read (e.g. ticket scan), drop to drizzle: `const drizzle: any = (payload.db as any).drizzle` then `drizzle.execute(sql\`UPDATE ... WHERE cond=false RETURNING ...\`)` with `sql` imported from `@payloadcms/db-postgres`. Result rows live on `res.rows`. Verified race-safe end-to-end: 20 concurrent identical scans → exactly 1 VALID.

## Advisory lock for a multi-step read-then-insert (seat sells, #179)

When the race spans *separate* statements that a single atomic `UPDATE` can't cover — e.g. `COUNT active tickets` → capacity check → `INSERT` order + tickets — wrap the whole critical section in a **Postgres advisory lock** keyed on the entity id. `withShowSellLock(pool, showId, fn)` in `src/lib/tickets/sell-lock.ts` takes a dedicated pooled connection, `pg_advisory_lock(7799, showId)`, runs `fn` (which may insert via `payload.create` on other connections — they commit before the lock releases), then `pg_advisory_unlock`. Wired as an injectable `withSeatLock` dep into `createPartnerSale` and `handlePaymentSucceeded`; defaults to a pass-through in unit tests. Different ids → different keys → no deadlock. Proven by `scripts/probe-oversell.mjs` (20 concurrent sells for 3 seats → exactly 3 locked; oversells unlocked).
