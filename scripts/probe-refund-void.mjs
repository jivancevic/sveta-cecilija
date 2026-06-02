// Integration probe for the refund cascade's void SQL (#170).
//
// The refund-order + ticket-void unit tests are pure/offline — they assert the
// *wiring* (void called with reason=refund after markRefunded, idempotent
// short-circuit, count flows through) but never run the real
// `UPDATE tickets ... WHERE order_id=$1 AND status='active'` that the refund
// route wires. The cascade-frees-seats claim that justifies the whole feature
// (seats = COUNT(active tickets), ADR-0008) was only asserted at the mock
// boundary. This probe closes that gap WITHOUT forcing Postgres into the
// offline `npm test` suite (CLAUDE.md: the unit suite is offline by design).
//
// It exercises the exact void SQL from src/app/api/orders/[id]/refund/route.ts
// and the exact count SQL from src/lib/tickets/sold-seats.ts against a live DB,
// then proves: (1) the void cancels the order's active tickets with
// reason=refund, (2) the show's active/sold count drops by exactly that many,
// (3) other orders are untouched, (4) a re-run voids 0 (idempotent).
//
// SAFE ANYWHERE: everything runs inside a single transaction that is ALWAYS
// ROLLED BACK — it never commits, so it leaves zero residue even if pointed at
// production. Run it against the dev/staging DB anyway:
//
//   set -a && . .env.local && set +a && node scripts/probe-refund-void.mjs
//
// Exit 0 = all assertions passed; exit 1 = a regression in the void/seat SQL.

import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

// --- the SQL under test, copied verbatim from the app -----------------------

// src/app/api/orders/[id]/refund/route.ts — atomicVoidActiveTickets
const VOID_SQL = `
  UPDATE tickets
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancel_reason = $2,
      updated_at = NOW()
  WHERE order_id = $1 AND status = 'active'
  RETURNING id
`

// src/lib/tickets/sold-seats.ts — getActiveTicketCountForShow
const ACTIVE_COUNT_SQL = `
  SELECT COUNT(*)::int AS sold
  FROM tickets t
  JOIN orders o ON o.id = t.order_id
  WHERE o.show_id = $1 AND t.status = 'active'
`

// --- tiny assertion helper --------------------------------------------------

let failures = 0
function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? '✓' : '✗'} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  if (!ok) failures++
}

async function activeCount(client, showId) {
  const res = await client.query(ACTIVE_COUNT_SQL, [showId])
  return Number(res.rows[0]?.sold ?? 0)
}

async function run() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[probe-refund-void] DATABASE_URL is not set. Source your env first:')
    console.error('  set -a && . .env.local && set +a && node scripts/probe-refund-void.mjs')
    process.exit(1)
  }
  const dbName = (() => {
    try {
      return new URL(url).pathname.replace(/^\//, '') || '(default)'
    } catch {
      return '(unparseable)'
    }
  })()
  console.log(`[probe-refund-void] DB="${dbName}" — all writes roll back, nothing is committed.\n`)

  const client = new Client({ connectionString: url })
  await client.connect()

  try {
    await client.query('BEGIN')

    // Unique token suffix so reruns never collide within the txn lifetime.
    const tag = `probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

    // A throwaway show.
    const show = await client.query(
      `INSERT INTO shows (date, time, venue, status)
       VALUES (NOW(), '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status)
       RETURNING id`,
    )
    const showId = show.rows[0].id

    // The order to refund: 3 active tickets.
    const order = await client.query(
      `INSERT INTO orders (buyer_name, email, adult_count, child_count, total, refund_status, show_id)
       VALUES ('Probe Buyer', 'probe@example.com', 3, 0, 6000, 'none', $1)
       RETURNING id`,
      [showId],
    )
    const orderId = order.rows[0].id
    for (let i = 0; i < 3; i++) {
      await client.query(
        `INSERT INTO tickets (token, order_id, type, status) VALUES ($1, $2, 'adult', 'active')`,
        [`${tag}-a-${i}`, orderId],
      )
    }

    // A bystander order on the SAME show — must stay untouched by the void.
    const other = await client.query(
      `INSERT INTO orders (buyer_name, email, adult_count, child_count, total, refund_status, show_id)
       VALUES ('Bystander', 'other@example.com', 1, 0, 2000, 'none', $1)
       RETURNING id`,
      [showId],
    )
    const otherId = other.rows[0].id
    await client.query(
      `INSERT INTO tickets (token, order_id, type, status) VALUES ($1, $2, 'adult', 'active')`,
      [`${tag}-b-0`, otherId],
    )

    // Baseline: 3 + 1 = 4 active seats on the show.
    assert('show active seats before void', await activeCount(client, showId), 4)

    // --- the void under test ---
    const voided = await client.query(VOID_SQL, [orderId, 'refund'])
    assert('void cancelled the order\'s active tickets', voided.rows.length, 3)

    // The freed seats: only the bystander's 1 remains.
    assert('show active seats after void (seats freed)', await activeCount(client, showId), 1)

    // The voided tickets carry reason=refund and status=cancelled.
    const voidedRows = await client.query(
      `SELECT status, cancel_reason FROM tickets WHERE order_id = $1`,
      [orderId],
    )
    const allRefundCancelled = voidedRows.rows.every(
      (r) => r.status === 'cancelled' && r.cancel_reason === 'refund',
    )
    assert('all of the order\'s tickets are cancelled with reason=refund', allRefundCancelled, true)

    // The bystander order is untouched.
    const bystander = await client.query(
      `SELECT status FROM tickets WHERE order_id = $1`,
      [otherId],
    )
    assert('bystander order untouched (still active)', bystander.rows[0].status, 'active')

    // Idempotency: a second void on the same order cancels 0.
    const reVoided = await client.query(VOID_SQL, [orderId, 'refund'])
    assert('re-running the void is a no-op (0 rows)', reVoided.rows.length, 0)
    assert('show active seats unchanged after re-void', await activeCount(client, showId), 1)
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }

  if (failures > 0) {
    console.error(`\n[probe-refund-void] FAILED — ${failures} assertion(s) failed.`)
    process.exit(1)
  }
  console.log('\n[probe-refund-void] PASSED — void SQL frees seats and is idempotent.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('[probe-refund-void] error:', err)
    process.exit(1)
  })
}
