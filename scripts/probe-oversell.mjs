// Concurrency probe for the oversell fix (#179). Proves the seat-sell advisory
// lock makes "N parallel sells of the last K seats" yield AT MOST K active
// tickets — the acceptance criterion that can only be shown under real
// concurrency, not in the offline unit suite.
//
// It replicates the production critical section from src/lib/tickets/sell-lock.ts
// + sold-seats.ts + create-partner-sale.ts: each worker, on its OWN connection,
//   pg_advisory_lock(7799, showId) → COUNT active tickets → if room, INSERT
//   order + 1 ticket → pg_advisory_unlock.
// N=20 workers race for K=3 seats on a throwaway show.
//
//   • Locked run   → exactly K tickets (serialized; the fix).
//   • Control run  → typically > K  (no lock; the bug it prevents). A tiny gap
//                    between COUNT and INSERT makes the race reliable.
//
// Unlike probe-refund-void.mjs this COMMITS rows (concurrency can't share one
// rolled-back txn), so it is GUARDED to dev/staging DBs and deletes everything
// it created on the way out.
//
//   set -a && . .env.local && set +a && node scripts/probe-oversell.mjs
//
// Exit 0 = locked run held the line at K; exit 1 = oversell regression.

import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg

const SEAT_LOCK_NS = 7799 // must match SEAT_SELL_LOCK_NAMESPACE in sell-lock.ts
const K = 3 // seats available
const N = 20 // concurrent sells racing for them

// COUNT active tickets for a show — mirrors getActiveTicketCountForShow.
const COUNT_SQL = `
  SELECT COUNT(*)::int AS sold
  FROM tickets t JOIN orders o ON o.id = t.order_id
  WHERE o.show_id = $1 AND t.status = 'active'
`

async function sellOneSeat(pool, showId, { useLock, jitterMs }) {
  const client = await pool.connect()
  try {
    if (useLock) await client.query('SELECT pg_advisory_lock($1, $2)', [SEAT_LOCK_NS, showId])
    try {
      const { rows } = await client.query(COUNT_SQL, [showId])
      const sold = Number(rows[0]?.sold ?? 0)
      // Widen the count→insert window so the unlocked control reliably races.
      if (jitterMs) await new Promise((r) => setTimeout(r, jitterMs))
      if (sold >= K) return false // no seat left
      const ord = await client.query(
        `INSERT INTO orders (buyer_name, email, adult_count, child_count, total, refund_status, show_id)
         VALUES ('Race', 'race@example.com', 1, 0, 2000, 'none', $1) RETURNING id`,
        [showId],
      )
      await client.query(
        `INSERT INTO tickets (token, order_id, type, status)
         VALUES ($1, $2, 'adult', 'active')`,
        [`oversell-probe-${showId}-${ord.rows[0].id}`, ord.rows[0].id],
      )
      return true
    } finally {
      if (useLock) await client.query('SELECT pg_advisory_unlock($1, $2)', [SEAT_LOCK_NS, showId])
    }
  } finally {
    client.release()
  }
}

async function makeShow(pool) {
  const { rows } = await pool.query(
    `INSERT INTO shows (date, time, venue, status)
     VALUES (NOW(), '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status)
     RETURNING id`,
  )
  return rows[0].id
}

async function dropShow(pool, showId) {
  await pool.query(`DELETE FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE show_id = $1)`, [showId])
  await pool.query(`DELETE FROM orders WHERE show_id = $1`, [showId])
  await pool.query(`DELETE FROM shows WHERE id = $1`, [showId])
}

async function activeCount(pool, showId) {
  const { rows } = await pool.query(COUNT_SQL, [showId])
  return Number(rows[0]?.sold ?? 0)
}

async function runScenario(pool, { useLock, jitterMs }) {
  const showId = await makeShow(pool)
  try {
    await Promise.all(
      Array.from({ length: N }, () => sellOneSeat(pool, showId, { useLock, jitterMs })),
    )
    return await activeCount(pool, showId)
  } finally {
    await dropShow(pool, showId)
  }
}

async function run() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[probe-oversell] DATABASE_URL is not set. Source your env first:')
    console.error('  set -a && . .env.local && set +a && node scripts/probe-oversell.mjs')
    process.exit(1)
  }
  const dbName = (() => {
    try {
      return new URL(url).pathname.replace(/^\//, '') || '(default)'
    } catch {
      return '(unparseable)'
    }
  })()
  // This probe COMMITS rows, so refuse anything that isn't obviously a dev/staging DB.
  if (!/dev|staging/i.test(dbName)) {
    console.error(`[probe-oversell] refusing to run against "${dbName}" — dev/staging only (it commits rows).`)
    process.exit(1)
  }
  console.log(`[probe-oversell] DB="${dbName}" — ${N} concurrent sells racing for ${K} seats.\n`)

  const pool = new Pool({ connectionString: url, max: N + 2 })
  let failed = false
  try {
    const control = await runScenario(pool, { useLock: false, jitterMs: 15 })
    console.log(`control (NO lock):  ${control} active tickets  ${control > K ? '→ OVERSOLD (race reproduced)' : '(no race this run)'}`)

    const locked = await runScenario(pool, { useLock: true, jitterMs: 15 })
    const ok = locked === K
    console.log(`${ok ? '✓' : '✗'} locked (advisory):  ${locked} active tickets  (expected exactly ${K})`)
    if (!ok) failed = true
  } finally {
    await pool.end()
  }

  if (failed) {
    console.error('\n[probe-oversell] FAILED — the lock did not hold the line at K. Oversell regression.')
    process.exit(1)
  }
  console.log('\n[probe-oversell] PASSED — at most K active tickets under concurrency.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('[probe-oversell] error:', err)
    process.exit(1)
  })
}
