// One-shot backfill of the 2026 season's offline sales (ADR-0025).
//
// Two sources, both of which were invisible in the dashboard until now:
//
//  • DOOR — the secretary's paper tally, "2026.Karte na ulazu.odt", fifteen
//    evenings from 18.05 to 31.08. The document's own totals row does NOT
//    reconcile: its adult column sums to 619 while the typed total says 599.
//    The fifteen per-night figures are authoritative (confirmed by the society,
//    2026-09-12); only they can attach to a performance at all.
//
//  • LEGACY — the old WordPress/Tickera site, counted straight off its
//    Attendees & Tickets list on 2026-09-11: 157 completed tickets, 154 adult
//    and 3 child, over five evenings. The old store charged the same €20/€10
//    and is now frozen, so these figures are final.
//
// Deliberately NOT in db/schema/: that directory re-runs on every restart and
// holds schema evolution, not one-time data (db/schema/README.md).
//
// Idempotent by construction: a (performance, source) pair that already has
// ledger lines is skipped, and the two cached counters are RECOMPUTED from the
// ledger rather than incremented, so a second run changes nothing. The recompute
// is also why the three legacy evenings whose `legacy_reserved` was already set
// by hand at cutover (08.06 = 15, 23.06 = 2, 24.06 = 3) can be entered here
// without double-counting: the ledger sum equals the value already there.
//
//   set -a && . .env.local && set +a && node scripts/backfill-offline-sales-2026.mjs
//   node scripts/backfill-offline-sales-2026.mjs --dry-run
//
// Exit 0 = every performance reconciled; exit 1 = something did not match.

import pg from 'pg'

const { Pool } = pg

const ADULT = 2000
const CHILD = 1000
const PENSIONER = 1500
const PENSIONER_LABEL = 'umirovljenici (grupni popust)'

// adult / child are full-price counts; `discounted` is adults at a lower price
// carrying the reason for it. A discounted seat stays an ADULT seat (ADR-0025).
const DOOR = [
  { date: '2026-05-18', adult: 48 },
  { date: '2026-05-25', adult: 83, child: 6 },
  { date: '2026-06-08', adult: 68, discounted: { count: 32, priceCents: PENSIONER, label: PENSIONER_LABEL } },
  { date: '2026-06-10', adult: 47, child: 2 },
  { date: '2026-06-23', adult: 55, child: 3 },
  { date: '2026-06-24', adult: 29, child: 3 },
  { date: '2026-07-06', adult: 24, child: 4 },
  { date: '2026-07-08', adult: 39, child: 2 },
  { date: '2026-07-20', adult: 38 },
  { date: '2026-07-22', adult: 16, child: 2 },
  { date: '2026-08-03', adult: 17, child: 5 },
  { date: '2026-08-06', adult: 31, child: 6 },
  { date: '2026-08-17', adult: 57, child: 12 },
  { date: '2026-08-19', adult: 25, child: 8 },
  { date: '2026-08-31', adult: 42 },
]

// The 22.06 performance was postponed to 23.06; its two legacy tickets follow it.
const LEGACY = [
  { date: '2026-05-18', adult: 75 },
  { date: '2026-05-25', adult: 59, child: 3 },
  { date: '2026-06-08', adult: 15 },
  { date: '2026-06-23', adult: 2 },
  { date: '2026-06-24', adult: 3 },
]

function linesFor(entry) {
  const lines = []
  if (entry.adult) lines.push({ type: 'adult', quantity: entry.adult, priceCents: ADULT, label: null })
  if (entry.child) lines.push({ type: 'child', quantity: entry.child, priceCents: CHILD, label: null })
  if (entry.discounted) {
    lines.push({
      type: 'adult',
      quantity: entry.discounted.count,
      priceCents: entry.discounted.priceCents,
      label: entry.discounted.label,
    })
  }
  return lines
}

const eur = (cents) => `€${(cents / 100).toFixed(2)}`

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  let inserted = 0
  let skipped = 0
  let seats = 0
  let revenue = 0

  try {
    for (const [source, entries] of [
      ['door', DOOR],
      ['legacy', LEGACY],
    ]) {
      for (const entry of entries) {
        const showRes = await client.query(
          `SELECT id FROM shows WHERE is_public = true AND date::date = $1::date ORDER BY id`,
          [entry.date],
        )
        if (showRes.rows.length === 0) {
          console.error(`  ✗ ${source} ${entry.date}: no public performance on that date`)
          process.exitCode = 1
          continue
        }
        // Refuse rather than guess. Picking the lower id would put a whole
        // evening's takings on the wrong performance with nothing in the log.
        if (showRes.rows.length > 1) {
          console.error(
            `  ✗ ${source} ${entry.date}: ${showRes.rows.length} public performances on that date (ids ${showRes.rows
              .map((r) => r.id)
              .join(', ')}) — resolve by hand`,
          )
          process.exitCode = 1
          continue
        }
        const showId = showRes.rows[0].id

        const existing = await client.query(
          `SELECT COUNT(*)::int AS n FROM offline_sales WHERE show_id = $1 AND source = $2`,
          [showId, source],
        )
        if (existing.rows[0].n > 0) {
          console.log(`  · ${source} ${entry.date}: already has ${existing.rows[0].n} line(s), skipping`)
          skipped += 1
          continue
        }

        const lines = linesFor(entry)
        const lineSeats = lines.reduce((s, l) => s + l.quantity, 0)
        const lineRevenue = lines.reduce((s, l) => s + l.quantity * l.priceCents, 0)
        seats += lineSeats
        revenue += lineRevenue

        const detail = lines
          .map((l) => `${l.quantity}×${l.type}@${eur(l.priceCents)}${l.label ? ` (${l.label})` : ''}`)
          .join(', ')
        console.log(`  ${dryRun ? '?' : '+'} ${source} ${entry.date} [show ${showId}]: ${detail} = ${eur(lineRevenue)}`)
        if (dryRun) continue

        await client.query('BEGIN')
        try {
          for (const l of lines) {
            await client.query(
              `INSERT INTO offline_sales (show_id, source, ticket_type, quantity, unit_price_cents, discount_label, note)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [showId, source, l.type, l.quantity, l.priceCents, l.label, '2026 season backfill'],
            )
          }
          // Recompute from the ledger rather than incrementing, so this is safe
          // to re-run and so a counter set by hand at cutover lands on the same
          // value instead of doubling.
          //
          // ONLY the source just written. Recomputing both would zero the other
          // source's counter on any performance whose lines this pass does not
          // carry — the door pass runs first, so 2026-06-08's legacy_reserved
          // would be wiped and only restored later, leaving 15 seats missing if
          // the run aborted in between.
          const column = source === 'door' ? 'in_person_sold' : 'legacy_reserved'
          await client.query(
            `UPDATE shows s SET
               ${column} = (SELECT COALESCE(SUM(quantity), 0) FROM offline_sales WHERE show_id = s.id AND source = $2),
               updated_at = NOW()
             WHERE s.id = $1`,
            [showId, source],
          )
          await client.query('COMMIT')
          inserted += lines.length
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        }
      }
    }

    console.log('')
    console.log(`  ${dryRun ? 'would insert' : 'inserted'} ${dryRun ? seats : inserted} ${dryRun ? 'seats' : 'lines'}`)
    console.log(`  seats:   ${seats}`)
    console.log(`  revenue: ${eur(revenue)}`)
    if (skipped) console.log(`  skipped: ${skipped} performance/source pair(s) that already had lines`)

    if (!dryRun) {
      // Prove the invariant the whole design rests on: the cached counters equal
      // the ledger, per source, on every public performance.
      const drift = await client.query(`
        SELECT s.id, s.date::date AS d, s.in_person_sold, s.legacy_reserved,
               COALESCE(d.q, 0) AS door_q, COALESCE(l.q, 0) AS legacy_q
        FROM shows s
        LEFT JOIN (SELECT show_id, SUM(quantity) AS q FROM offline_sales WHERE source='door'   GROUP BY show_id) d ON d.show_id = s.id
        LEFT JOIN (SELECT show_id, SUM(quantity) AS q FROM offline_sales WHERE source='legacy' GROUP BY show_id) l ON l.show_id = s.id
        WHERE s.is_public = true
          AND (s.in_person_sold <> COALESCE(d.q, 0) OR s.legacy_reserved <> COALESCE(l.q, 0))
      `)
      if (drift.rows.length > 0) {
        console.error('')
        console.error('  ✗ counters disagree with the ledger on these performances:')
        for (const r of drift.rows) {
          console.error(
            `    ${r.d}: in_person_sold=${r.in_person_sold} vs ledger ${r.door_q}; legacy_reserved=${r.legacy_reserved} vs ledger ${r.legacy_q}`,
          )
        }
        process.exitCode = 1
      } else {
        console.log('  ✓ every counter matches the ledger')
      }
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
