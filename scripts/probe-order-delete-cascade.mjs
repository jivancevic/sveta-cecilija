// Integration probe for the order-delete cascade (admin "delete order" bug).
//
// The tickets → orders FK is `ON DELETE SET NULL` on a NOT NULL column, so a
// bare `DELETE FROM orders` for an order that has tickets throws:
//   null value in column "order_id" of relation "tickets" violates not-null constraint
// which is the admin failure. The fix is the Orders `beforeDelete` hook
// (src/collections/Orders.ts → cascadeOrderTicketsDelete), which deletes the
// order's tickets FIRST, in the same transaction. This probe reproduces the
// bug and proves the hook's ordering is what makes the delete succeed, against
// a LIVE DB with the real (SET NULL) FK — the unit test only covers the wiring.
//
// SAFE ANYWHERE: everything runs inside a single transaction that is ALWAYS
// ROLLED BACK — it never commits, so it leaves zero residue even against prod:
//
//   set -a && . .env.local && set +a && node scripts/probe-order-delete-cascade.mjs
//
// Exit 0 = bug reproduced AND hook ordering fixes it; exit 1 = a regression.

import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

let failures = 0
function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? '✓' : '✗'} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  if (!ok) failures++
}

async function run() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[probe-order-delete-cascade] DATABASE_URL is not set. Source your env first:')
    console.error('  set -a && . .env.local && set +a && node scripts/probe-order-delete-cascade.mjs')
    process.exit(1)
  }
  const dbName = (() => {
    try {
      return new URL(url).pathname.replace(/^\//, '') || '(default)'
    } catch {
      return '(unparseable)'
    }
  })()
  console.log(`[probe-order-delete-cascade] DB="${dbName}" — all writes roll back, nothing is committed.\n`)

  const client = new Client({ connectionString: url })
  await client.connect()

  try {
    await client.query('BEGIN')

    const tag = `probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

    const show = await client.query(
      `INSERT INTO shows (date, time, venue, status)
       VALUES (NOW(), '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status)
       RETURNING id`,
    )
    const showId = show.rows[0].id

    // The order to delete: 3 tickets (2 adult + 1 child).
    const order = await client.query(
      `INSERT INTO orders (buyer_name, email, adult_count, child_count, total, refund_status, show_id)
       VALUES ('Probe Buyer', 'probe@example.com', 2, 1, 5000, 'none', $1)
       RETURNING id`,
      [showId],
    )
    const orderId = order.rows[0].id
    for (const [i, type] of ['adult', 'adult', 'child'].entries()) {
      await client.query(
        `INSERT INTO tickets (token, order_id, type, status) VALUES ($1, $2, $3, 'active')`,
        [`${tag}-${type}-${i}`, orderId, type],
      )
    }

    // A bystander order on the SAME show — must survive the delete.
    const other = await client.query(
      `INSERT INTO orders (buyer_name, email, adult_count, child_count, total, refund_status, show_id)
       VALUES ('Bystander', 'other@example.com', 1, 0, 2000, 'none', $1)
       RETURNING id`,
      [showId],
    )
    const otherId = other.rows[0].id
    await client.query(
      `INSERT INTO tickets (token, order_id, type, status) VALUES ($1, $2, 'adult', 'active')`,
      [`${tag}-bystander`, otherId],
    )

    // (1) Reproduce the bug: deleting the order directly still errors while it
    // has tickets. Wrap in a SAVEPOINT so the expected failure doesn't abort
    // the whole probe transaction.
    await client.query('SAVEPOINT before_naive')
    let naiveError = null
    try {
      await client.query(`DELETE FROM orders WHERE id = $1`, [orderId])
    } catch (e) {
      naiveError = e.message
    }
    await client.query('ROLLBACK TO SAVEPOINT before_naive')
    assert(
      'bare DELETE FROM orders still fails on the NOT NULL/SET NULL FK',
      /order_id.*violates not-null|not-null constraint/.test(naiveError || ''),
      true,
    )

    // (2) The hook's ordering: delete the order's tickets first, then the order.
    await client.query(`DELETE FROM tickets WHERE order_id = $1`, [orderId])
    const del = await client.query(`DELETE FROM orders WHERE id = $1`, [orderId])
    assert('ordered delete removes exactly 1 order (no error)', del.rowCount, 1)

    const leftover = await client.query(`SELECT COUNT(*)::int AS n FROM tickets WHERE order_id = $1`, [orderId])
    assert('deleted order has 0 tickets left', leftover.rows[0].n, 0)

    const bystander = await client.query(`SELECT COUNT(*)::int AS n FROM tickets WHERE order_id = $1`, [otherId])
    assert('bystander order untouched (1 ticket)', bystander.rows[0].n, 1)
    const bystanderOrder = await client.query(`SELECT COUNT(*)::int AS n FROM orders WHERE id = $1`, [otherId])
    assert('bystander order still present', bystanderOrder.rows[0].n, 1)
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }

  if (failures > 0) {
    console.error(`\n[probe-order-delete-cascade] FAILED — ${failures} assertion(s) failed.`)
    process.exit(1)
  }
  console.log('\n[probe-order-delete-cascade] PASSED — tickets-first ordering deletes the order cleanly.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('[probe-order-delete-cascade] error:', err)
    process.exit(1)
  })
}
