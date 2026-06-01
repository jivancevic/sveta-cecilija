#!/usr/bin/env node
//
// seed-staging.mjs — on-demand "reset my staging data" tool.
//
// Seeds DELIBERATELY AWKWARD synthetic fixtures into the STAGING database
// so the prod-like dev.moreska.eu environment can be exercised end-to-end
// without ever copying real buyer PII (see ADR-0009, "Synthetic data, not a
// prod snapshot").
//
// This is NOT wired into bootstrap-db.mjs or any auto-deploy step. Run it by
// hand when staging fixtures need refreshing:
//
//   set -a && . .env.local && set +a && npm run seed:staging
//
// (Standalone node scripts don't auto-load .env.local — next dev does, this
//  doesn't. If DATABASE_URL isn't in the shell env the guard below exits.)
//
// SAFETY GUARD
// ------------
// Refuses to run unless DATABASE_URL's database name contains "staging".
// Prod's DB is "postgres" and local is "sveta_cecilija_dev" — neither matches,
// so this guard protects both from ever being seeded with junk. The whole
// point of the staging env is a place awkward fixtures can live; this guard is
// what keeps them there.
//
// IDEMPOTENCY
// -----------
// Safe to run repeatedly. Every seed row carries a recognizable marker:
//   - orders:    stripe_payment_intent_id LIKE 'pi_TEST_seed_%'
//   - qr_tokens: token       LIKE 'TEST_seed_%'
//   - shows:     time = SEED_TIME_MARKER ('00:01', a sentinel no real show uses)
// On each run we delete those marked rows first (qr_tokens → orders → shows,
// child-before-parent to respect FKs), then re-insert from scratch. Real shows
// seeded by db/schema/seed-shows.sql and any admin-entered rows are untouched
// because they never carry these markers. No TRUNCATE is used, so the
// payload_locked_documents_rels CASCADE trap (CLAUDE.md) does not apply.
//
// Built on the same pg Client pattern as scripts/bootstrap-db.mjs — plain SQL
// through `pg`, no Payload CLI bootstrapping required, runs on any Node.
//
// ─── Fixtures and what each one exercises ─────────────────────────────────
//
//   SHOWS
//   • "today" show        — date = today, time field still '00:01' marker but
//                           a real future-ish datetime so getNextShow() /
//                           door-flow + /scan testing has a live target.
//   • cancelled show      — status='cancelled'; must be hidden from /tickets.
//   • sold-out show       — online_sold + in_person_sold == VENUE_CAPACITY
//                           (zimsko-kino = 250); remaining seats = 0, hidden
//                           from /tickets, visible in /admin.
//
//   ORDERS (+ one qr_token each so /scan/[token] is testable)
//   • adults-only order   — child_count = 0; PDF/email + counts must handle
//                           an order with no child tickets.
//   • refunded order      — refund_status='refunded'; refund UI + stats must
//                           treat it as refunded (idempotent re-refund guard).
//   • door / scan order   — attached to the "today" show with online_sold
//                           bumped so /admin shows non-zero stats and the
//                           qr_token can be scanned VALID → ALREADY_SCANNED.
//
// Buyer names/emails (Test Buyer A, test-a@example.invalid) and Stripe ids
// (pi_TEST_seed_<n>) are obviously fake by construction.

import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const SEED_TIME_MARKER = '00:01' // sentinel time; no real show is scheduled here
const PI_PREFIX = 'pi_TEST_seed_'
const TOKEN_PREFIX = 'TEST_seed_'
const VENUE_CAPACITY = { 'ljetno-kino': 320, 'zimsko-kino': 250 }

/** Extract the database name from a postgres connection string. */
function dbNameFromUrl(url) {
  try {
    // pathname is "/dbname"; strip leading slash and any query string.
    const u = new URL(url)
    return decodeURIComponent(u.pathname.replace(/^\//, '')) || ''
  } catch {
    // Fall back to a naive parse for non-URL-parseable conn strings.
    const m = url.match(/\/([^/?]+)(\?|$)/)
    return m ? m[1] : ''
  }
}

/** today at HH:MM local, returned as an ISO timestamp string. */
function todayAt(hours, minutes) {
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[seed-staging] DATABASE_URL is not set. Source your env first:')
    console.error('[seed-staging]   set -a && . .env.local && set +a && npm run seed:staging')
    process.exit(1)
  }

  const dbName = dbNameFromUrl(url)
  if (!dbName.includes('staging')) {
    console.error(
      `[seed-staging] REFUSING TO RUN: database name "${dbName}" does not contain "staging".`,
    )
    console.error(
      '[seed-staging] This script only ever seeds the staging DB so awkward fixtures can never',
    )
    console.error(
      '[seed-staging] land in prod (db "postgres") or local dev (db "sveta_cecilija_dev").',
    )
    process.exit(1)
  }

  const client = new Client({ connectionString: url })
  await client.connect()
  console.log(`[seed-staging] connected to "${dbName}" — seeding awkward fixtures.`)

  try {
    await client.query('BEGIN')

    // ─── 1. Clean out prior seed rows (child → parent for FKs) ────────────
    const delTokens = await client.query(
      `DELETE FROM qr_tokens WHERE token LIKE $1`,
      [`${TOKEN_PREFIX}%`],
    )
    const delOrders = await client.query(
      `DELETE FROM orders WHERE stripe_payment_intent_id LIKE $1`,
      [`${PI_PREFIX}%`],
    )
    const delShows = await client.query(
      `DELETE FROM shows WHERE time = $1`,
      [SEED_TIME_MARKER],
    )
    console.log(
      `[seed-staging] cleared prior seed rows: ${delTokens.rowCount} qr_tokens, ` +
        `${delOrders.rowCount} orders, ${delShows.rowCount} shows.`,
    )

    // ─── 2. Awkward shows ─────────────────────────────────────────────────
    // All carry time = SEED_TIME_MARKER so they're recognizably ours on the
    // next run. The "today" show's date is genuinely today so getNextShow()
    // and the door flow have a live target.

    const todayShow = await client.query(
      `INSERT INTO shows (date, time, venue, online_sold, in_person_sold, status)
       VALUES ($1, $2, 'ljetno-kino', 0, 0, 'active')
       RETURNING id`,
      [todayAt(12, 0), SEED_TIME_MARKER],
    )
    const todayShowId = todayShow.rows[0].id

    const cancelledShow = await client.query(
      `INSERT INTO shows (date, time, venue, online_sold, in_person_sold, status)
       VALUES ($1, $2, 'ljetno-kino', 0, 0, 'cancelled')
       RETURNING id`,
      [todayAt(20, 0), SEED_TIME_MARKER],
    )
    const cancelledShowId = cancelledShow.rows[0].id

    // Sold-out: online_sold + in_person_sold === VENUE_CAPACITY[venue].
    // Use zimsko-kino (250) and split the capacity across both channels.
    const soldOutCap = VENUE_CAPACITY['zimsko-kino']
    const soldOutOnline = 200
    const soldOutInPerson = soldOutCap - soldOutOnline // 50
    // Future date (7 days out) so it would otherwise show on /tickets but for
    // being sold out.
    const soldOutDate = new Date()
    soldOutDate.setDate(soldOutDate.getDate() + 7)
    soldOutDate.setHours(12, 0, 0, 0)
    const soldOutShow = await client.query(
      `INSERT INTO shows (date, time, venue, online_sold, in_person_sold, status)
       VALUES ($1, $2, 'zimsko-kino', $3, $4, 'active')
       RETURNING id`,
      [soldOutDate.toISOString(), SEED_TIME_MARKER, soldOutOnline, soldOutInPerson],
    )
    const soldOutShowId = soldOutShow.rows[0].id

    console.log(
      `[seed-staging] shows: today=${todayShowId} (active), ` +
        `cancelled=${cancelledShowId}, sold-out=${soldOutShowId} ` +
        `(${soldOutOnline}+${soldOutInPerson}/${soldOutCap}).`,
    )

    // ─── 3. Awkward orders (+ a qr_token each) ────────────────────────────
    // total is EUR cents: adult €20 = 2000, child €10 = 1000.

    // (a) Adults-only order against the today show. Also bumps online_sold so
    //     /admin shows non-zero stats and the door flow has live numbers.
    const adultCountA = 3
    const childCountA = 0
    const orderA = await client.query(
      `INSERT INTO orders
         (buyer_name, email, adult_count, child_count, total,
          stripe_payment_intent_id, refund_status, show_id, locale)
       VALUES ($1, $2, $3, $4, $5, $6, 'none', $7, 'en')
       RETURNING id`,
      [
        'Test Buyer A',
        'test-a@example.invalid',
        adultCountA,
        childCountA,
        adultCountA * 2000 + childCountA * 1000,
        `${PI_PREFIX}1`,
        todayShowId,
      ],
    )
    const orderAId = orderA.rows[0].id
    await client.query(
      `INSERT INTO qr_tokens (token, order_id, scanned) VALUES ($1, $2, false)`,
      [`${TOKEN_PREFIX}A`, orderAId],
    )
    // Reflect this order's seats in the today show's online_sold so /admin and
    // the scan-stats surfaces read non-zero.
    await client.query(
      `UPDATE shows SET online_sold = COALESCE(online_sold, 0) + $1, updated_at = NOW()
       WHERE id = $2`,
      [adultCountA + childCountA, todayShowId],
    )

    // (b) Refunded order against the today show (mix of adult + child).
    const adultCountB = 2
    const childCountB = 1
    const orderB = await client.query(
      `INSERT INTO orders
         (buyer_name, email, adult_count, child_count, total,
          stripe_payment_intent_id, refund_status, show_id, locale)
       VALUES ($1, $2, $3, $4, $5, $6, 'refunded', $7, 'hr')
       RETURNING id`,
      [
        'Test Buyer B',
        'test-b@example.invalid',
        adultCountB,
        childCountB,
        adultCountB * 2000 + childCountB * 1000,
        `${PI_PREFIX}2`,
        todayShowId,
      ],
    )
    const orderBId = orderB.rows[0].id
    await client.query(
      `INSERT INTO qr_tokens (token, order_id, scanned) VALUES ($1, $2, false)`,
      [`${TOKEN_PREFIX}B`, orderBId],
    )
    // A refunded order's seats are NOT counted toward online_sold (they were
    // released), so no online_sold bump here.

    // (c) Door / scan order — attached to the today show, already scanned so
    //     /scan/[token] exercises the ALREADY_SCANNED branch out of the box,
    //     while tokens A and B above stay unscanned for the VALID branch.
    const adultCountC = 4
    const childCountC = 2
    const orderC = await client.query(
      `INSERT INTO orders
         (buyer_name, email, adult_count, child_count, total,
          stripe_payment_intent_id, refund_status, show_id, locale)
       VALUES ($1, $2, $3, $4, $5, $6, 'none', $7, 'en')
       RETURNING id`,
      [
        'Test Buyer C',
        'test-c@example.invalid',
        adultCountC,
        childCountC,
        adultCountC * 2000 + childCountC * 1000,
        `${PI_PREFIX}3`,
        todayShowId,
      ],
    )
    const orderCId = orderC.rows[0].id
    await client.query(
      `INSERT INTO qr_tokens (token, order_id, scanned, scanned_at)
       VALUES ($1, $2, true, NOW())`,
      [`${TOKEN_PREFIX}C`, orderCId],
    )
    await client.query(
      `UPDATE shows SET online_sold = COALESCE(online_sold, 0) + $1, updated_at = NOW()
       WHERE id = $2`,
      [adultCountC + childCountC, todayShowId],
    )

    await client.query('COMMIT')

    console.log('[seed-staging] orders + qr_tokens:')
    console.log(
      `[seed-staging]   A order=${orderAId} adults-only (${adultCountA}+0), ` +
        `token=${TOKEN_PREFIX}A (unscanned → /scan VALID)`,
    )
    console.log(
      `[seed-staging]   B order=${orderBId} refunded (${adultCountB}+${childCountB}), ` +
        `token=${TOKEN_PREFIX}B (unscanned → /scan VALID)`,
    )
    console.log(
      `[seed-staging]   C order=${orderCId} door (${adultCountC}+${childCountC}), ` +
        `token=${TOKEN_PREFIX}C (scanned → /scan ALREADY_SCANNED)`,
    )
    console.log('[seed-staging] done. Re-run any time to reset staging fixtures.')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

// Only run when invoked directly (not when imported by a test).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[seed-staging] failed:', err.message)
    process.exit(1)
  })
}

export { dbNameFromUrl }
