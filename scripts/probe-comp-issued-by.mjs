// Integration probe for orders.comp_issued_by (#434, ADR-0019 × ADR-0024).
//
// The sibling of `probe-lineup-schema.mjs`, for the same reason: the unit suite
// proves the migration writes no unguarded row mutation and the drift gate
// proves `db/schema/` reproduces what Payload push needs, but neither can prove
// that re-applying `migrate-zz-c-orders-comp-issued-by.sql` on every restart is
// a no-op, that it UPGRADES an older populated database, or that the BACKFILL
// does what it claims — mark the comps that already exist as admin comps and
// leave every other order alone.
//
// It also proves the two facts the cap query rests on: the column has NO
// default, so a new online or partner order is never labelled "Admin" in the
// /admin list, and an admin comp (which writes 'admin' explicitly) is never
// counted as one of a dancer's own four (#430, story 52).
//
// It CREATES ITS OWN THROWAWAY DATABASE, runs the real `scripts/bootstrap-db.mjs`
// against it and DROPS it again. It never touches sveta_cecilija_dev, staging or
// production — DATABASE_URL supplies only the host and credentials.
//
//   set -a && . .env.local && set +a && node scripts/probe-comp-issued-by.mjs
//
// Asserts, in order:
//   1. fresh bootstrap  → the enum, the column, the default;
//   2. second bootstrap → no error, nothing duplicated (the restart case);
//   3. a new paid online order stays NULL while an admin comp reads back
//      'admin' and a self-issued one 'self', and the cap query separates them;
//   4. downgrade to the pre-#434 shape with a comp order already in the table,
//      bootstrap again → the column is back and that comp is backfilled to
//      'admin', while a non-comp order stays NULL;
//   5. a database carrying the FIRST revision's default → bootstrap drops it.
//
// Exit 0 = all assertions passed; exit 1 = the schema regressed.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const { Client } = pg

const dirname = path.dirname(fileURLToPath(import.meta.url))
const bootstrap = path.join(dirname, 'bootstrap-db.mjs')

let failures = 0
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

function runBootstrap(url) {
  execFileSync(process.execPath, [bootstrap], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}

const scalar = async (client, sql, params = []) =>
  (await client.query(sql, params)).rows[0]?.v ?? null

async function assertShape(client, label) {
  check(
    `${label}: type enum_orders_comp_issued_by exists with 2 values`,
    (await scalar(
      client,
      `SELECT count(*)::int AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'enum_orders_comp_issued_by'`,
    )) === 2,
  )

  check(
    `${label}: orders.comp_issued_by exists`,
    (await scalar(
      client,
      `SELECT 1 AS v FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'comp_issued_by'`,
    )) === 1,
  )

  check(
    `${label}: it has NO default, so a Stripe purchase is never labelled "Admin"`,
    (await scalar(
      client,
      `SELECT column_default AS v FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'comp_issued_by'`,
    )) === null,
  )

  check(
    `${label}: it is NULLABLE — every order that predates it carries NULL`,
    (await scalar(
      client,
      `SELECT is_nullable AS v FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'comp_issued_by'`,
    )) === 'YES',
  )
}

async function main() {
  const source = process.env.DATABASE_URL
  if (!source) throw new Error('DATABASE_URL is not set (needed for the scratch DB host/credentials)')

  const scratchName = `probe_comp_issued_by_${process.pid}`
  const admin = new URL(source)
  const scratch = new URL(source)
  admin.pathname = '/postgres'
  scratch.pathname = `/${scratchName}`

  const adminClient = new Client({ connectionString: admin.toString() })
  await adminClient.connect()
  console.log(`[probe] creating throwaway database ${scratchName}`)
  await adminClient.query(`DROP DATABASE IF EXISTS ${scratchName}`)
  await adminClient.query(`CREATE DATABASE ${scratchName}`)

  const client = new Client({ connectionString: scratch.toString() })
  try {
    await client.connect()

    // --- 1. fresh bootstrap -------------------------------------------------
    console.log('[probe] bootstrap #1 (fresh database)')
    runBootstrap(scratch.toString())
    await assertShape(client, 'fresh')

    // --- 2. second bootstrap (a plain restart) ------------------------------
    console.log('[probe] bootstrap #2 (populated database — the restart case)')
    runBootstrap(scratch.toString())
    await assertShape(client, 'restart')

    // --- 3. the two kinds of comp, and the cap query ------------------------
    console.log('[probe] an admin comp and a self-issued one')
    const show = await scalar(
      client,
      `INSERT INTO shows (date, time, kind, is_public, venue, status, updated_at, created_at)
       VALUES ('2026-08-05', '21:00', 'redovna', true, 'ljetno-kino', 'active', now(), now())
       RETURNING id AS v`,
    )
    const member = await scalar(
      client,
      `INSERT INTO members (name, is_moreskant, nickname, updated_at, created_at)
       VALUES ('Ivan Fabris', true, 'Cici', now(), now()) RETURNING id AS v`,
    )

    const order = async (code, columns) =>
      scalar(
        client,
        `INSERT INTO orders (code, channel, member_id, adult_count, child_count, total, refund_status, show_id, ${columns.names} updated_at, created_at)
         VALUES ($1, 'comp', $2, 1, 0, 0, 'none', $3, ${columns.values} now(), now())
         RETURNING id AS v`,
        [code, member, show],
      )

    // Both comp routes write the marker explicitly (`buildCompIssueDeps`).
    const adminOrder = await order('ADM-1', { names: 'comp_issued_by,', values: "'admin'," })
    const selfOrder = await order('SELF-1', { names: 'comp_issued_by,', values: "'self'," })

    check(
      'an admin comp carries its marker',
      (await scalar(client, `SELECT comp_issued_by AS v FROM orders WHERE id = $1`, [adminOrder])) ===
        'admin',
    )
    check(
      'a self-issued comp keeps its marker',
      (await scalar(client, `SELECT comp_issued_by AS v FROM orders WHERE id = $1`, [selfOrder])) ===
        'self',
    )

    const ticket = (orderId, type) =>
      client.query(
        `INSERT INTO tickets (token, type, status, order_id, updated_at, created_at)
         VALUES ($1, $2, 'active', $3, now(), now())`,
        [`tok-${orderId}-${type}`, type, orderId],
      )
    await ticket(adminOrder, 'adult')
    await ticket(selfOrder, 'adult')

    // The cap query, verbatim from src/lib/tickets/sold-seats.ts.
    const capped = await scalar(
      client,
      `SELECT COUNT(*)::int AS v
         FROM tickets t
         JOIN orders o ON o.id = t.order_id
        WHERE o.show_id = $1
          AND o.member_id = $2
          AND o.channel = 'comp'
          AND o.comp_issued_by = 'self'
          AND t.status = 'active'`,
      [show, member],
    )
    check("the cap counts the dancer's own ticket and not the admin's gift", capped === 1)

    // A new paid order takes no label at all: there is no default to take.
    const fresh = await scalar(
      client,
      `INSERT INTO orders (code, channel, adult_count, child_count, total, refund_status, show_id, updated_at, created_at)
       VALUES ('ONL-0', 'online', 2, 0, 4000, 'none', $1, now(), now()) RETURNING id AS v`,
      [show],
    )
    check(
      'a new online order stays NULL rather than reading "Admin" in the list',
      (await scalar(client, `SELECT comp_issued_by IS NULL AS v FROM orders WHERE id = $1`, [fresh])) ===
        true,
    )

    // --- 4. the upgrade path: an older DB with comps already in it ----------
    console.log('[probe] downgrade to the pre-#434 shape, then bootstrap again')
    const paid = await scalar(
      client,
      `INSERT INTO orders (code, channel, adult_count, child_count, total, refund_status, show_id, updated_at, created_at)
       VALUES ('ONL-1', 'online', 2, 0, 4000, 'none', $1, now(), now()) RETURNING id AS v`,
      [show],
    )
    // The downgrade also re-creates the pre-review shape: a column WITH the
    // default, so the DROP DEFAULT in the migration is exercised.
    await client.query('ALTER TABLE orders DROP COLUMN IF EXISTS comp_issued_by')
    await client.query('DROP TYPE IF EXISTS enum_orders_comp_issued_by')

    runBootstrap(scratch.toString())
    await assertShape(client, 'upgraded')
    check(
      'the comps that already existed are backfilled to admin',
      (await scalar(
        client,
        `SELECT count(*)::int AS v FROM orders WHERE channel = 'comp' AND comp_issued_by = 'admin'`,
      )) === 2,
      'both the admin comp and the (now historical) self one: the backfill is about age, not intent',
    )
    check(
      'a paid online order is left NULL rather than labelled',
      (await scalar(client, `SELECT comp_issued_by IS NULL AS v FROM orders WHERE id = $1`, [paid])) ===
        true,
    )

    // --- 5. a database that got the FIRST revision of this file -------------
    // That revision set a default of 'admin'. The migration now drops it, so a
    // developer's database (and any environment that ran the old file) ends up
    // in the same shape as a fresh one.
    console.log('[probe] a database that already has the old default')
    await client.query(
      `ALTER TABLE orders ALTER COLUMN comp_issued_by SET DEFAULT 'admin'::public.enum_orders_comp_issued_by`,
    )
    runBootstrap(scratch.toString())
    check(
      'bootstrap drops a default left behind by the first revision',
      (await scalar(
        client,
        `SELECT column_default AS v FROM information_schema.columns
          WHERE table_name = 'orders' AND column_name = 'comp_issued_by'`,
      )) === null,
    )
  } finally {
    await client.end().catch(() => {})
    console.log(`[probe] dropping ${scratchName}`)
    await adminClient.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`)
    await adminClient.end()
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll assertions passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
