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
// PER-PERSON TICKET MODEL (ADR-0007)
// ----------------------------------
// Tickets are one-per-person: the table is `tickets` (renamed from qr_tokens),
// each row is one admission with its own `type` (adult|child) and lifecycle
// `status` (active|cancelled). Seats sold for a show = COUNT(active tickets)
// for that show's orders (the old shows.online_sold column is RETIRED as the
// source of truth — see src/lib/shows.ts), so this script creates real
// per-person ticket rows rather than bumping a counter. A sold-out show is
// modelled with in_person_sold, which still counts against capacity.
//
// IDEMPOTENCY
// -----------
// Safe to run repeatedly. Every seed row carries a recognizable marker:
//   - orders:  stripe_payment_intent_id LIKE 'pi_TEST_seed_%'
//   - tickets: token                    LIKE 'TEST_seed_%'
//   - shows:   time = SEED_TIME_MARKER ('00:01', a sentinel no real show uses)
// On each run we delete those marked rows first (tickets → orders → shows,
// child-before-parent to respect FKs), then re-insert from scratch. Real shows
// seeded by db/schema/seed-shows.sql and any admin-entered rows are untouched
// because they never carry these markers. No TRUNCATE is used, so the
// payload_locked_documents_rels CASCADE trap (CLAUDE.md) does not apply.
//
// Users and the fixture partner are instead UPSERTED in place (keyed on user
// email / partner name) rather than delete-then-reinsert — Payload's
// payload_locked_documents_rels references both, so a blind delete could trip
// the same CASCADE trap, and an upsert is the simplest race-free re-run.
//
// STAGING LOGINS + PARTNER (issue #197)
// -------------------------------------
// Seeds throwaway accounts so /admin, authed /scan + stats, and the partner
// dashboard are exercisable (the staging DB otherwise has 0 users). One fixture
// partner + a partner-role login bound to it. Emails, password and partner are
// obviously fake; see the SEED_USERS / SEED_PARTNER block below for the exact
// credentials and how to log in.
//
// Built on the same pg Client pattern as scripts/bootstrap-db.mjs — plain SQL
// through `pg`, no Payload CLI bootstrapping required, runs on any Node.
//
// ─── Fixtures and what each one exercises ─────────────────────────────────
//
//   SHOWS (all carry time = SEED_TIME_MARKER so they're recognizably ours)
//   • "today" show   — date = today; getNextShow() + door-flow + /scan have a
//                      live target. Holds the per-person tickets below.
//   • cancelled show — status='cancelled'; must be hidden from /tickets.
//   • sold-out show  — in_person_sold == VENUE_CAPACITY (zimsko-kino = 250);
//                      remaining = 0, hidden from /tickets, visible in /admin.
//
//   ORDERS + per-person TICKETS (so /scan/[token] is testable in every state)
//   • adults-only order (A) — child_count = 0; 3 active adult tickets, all
//                             unscanned → /scan VALID.
//   • refunded order (B)    — refund_status='refunded'; its tickets are
//                             status='cancelled', cancel_reason='refund' →
//                             /scan CANCELLED. Cancelled tickets free their
//                             seats (excluded from the active COUNT).
//   • door order (C)        — 6 active tickets on the today show; the first is
//                             pre-scanned → /scan ALREADY_SCANNED, the rest
//                             unscanned → VALID.
//
// Buyer names/emails (Test Buyer A, test-a@example.invalid) and Stripe ids
// (pi_TEST_seed_<n>) are obviously fake by construction.

import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const SEED_TIME_MARKER = '00:01' // sentinel time; no real show is scheduled here
const PI_PREFIX = 'pi_TEST_seed_'
const TOKEN_PREFIX = 'TEST_seed_'
const VENUE_CAPACITY = { 'ljetno-kino': 320, 'zimsko-kino': 250 }
const ADULT_CENTS = 2000 // €20
const CHILD_CENTS = 1000 // €10

// ─── Staging logins (issue #197) ──────────────────────────────────────────
// Throwaway accounts so /admin, authed /scan + stats, and the partner
// dashboard are exercisable on dev.moreska.eu. ALL share one obviously-fake
// dev password and `@staging.local` emails so they can never be mistaken for a
// real account, and so the staging-only guard (db name must contain "staging")
// keeps them off prod/local. Rotate is irrelevant — these only ever live on the
// synthetic staging DB. To log in at https://dev.moreska.eu/admin :
//
//   admin@staging.local    / staging-dev-pw   role=admin    → full /admin
//   tehnika@staging.local  / staging-dev-pw   role=tehnika  → authed /scan + stats
//   partner@staging.local  / staging-dev-pw   role=partner  → partner dashboard
//                                                              (linked to the
//                                                               Kaleta fixture)
const SEED_PASSWORD = 'staging-dev-pw'
const SEED_USERS = [
  { email: 'admin@staging.local', role: 'admin' },
  { email: 'tehnika@staging.local', role: 'tehnika' },
  { email: 'partner@staging.local', role: 'partner' }, // partner_id wired below
]
// Fixture reseller (ADR-0008). Idempotency key is the (recognizably-fake) name.
const SEED_PARTNER = {
  name: 'Kaleta (STAGING fixture)',
  oib: '00000000000',
  billingAddress: 'Trg sv. Marka 1, 20260 Korčula (STAGING fixture)',
  commissionPercent: 10,
  active: true,
}

/**
 * Hash a password exactly the way Payload's local strategy does
 * (node:crypto pbkdf2: 25000 iterations, 512 key length, sha256, hex), so a
 * row inserted by raw SQL authenticates identically to one created through the
 * admin UI. Mirrors payload/dist/auth/strategies/local/generatePasswordSaltHash.
 * The script is pure `pg` (no Payload bootstrap), so we replicate the hash
 * rather than pull in the local API.
 */
function payloadPasswordSaltHash(password) {
  const salt = crypto.randomBytes(32).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 25000, 512, 'sha256').toString('hex')
  return { salt, hash }
}

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

/**
 * Insert one ticket row per person for an order.
 *
 * `adults` adult tickets then `children` child tickets, tokens
 * `TEST_seed_<letter><n>` (1-based). `status`/`cancelReason` apply to every
 * ticket (used for the refunded order). The first `scannedCount` tickets are
 * marked scanned (for the ALREADY_SCANNED branch). Returns the count created.
 */
async function insertPersonTickets(
  client,
  { orderId, letter, adults, children, status = 'active', cancelReason = null, scannedCount = 0 },
) {
  const types = [
    ...Array.from({ length: adults }, () => 'adult'),
    ...Array.from({ length: children }, () => 'child'),
  ]
  let n = 0
  for (const type of types) {
    n += 1
    const scanned = n <= scannedCount
    await client.query(
      `INSERT INTO tickets (token, order_id, scanned, scanned_at, type, status, cancel_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        `${TOKEN_PREFIX}${letter}${n}`,
        orderId,
        scanned,
        scanned ? new Date().toISOString() : null,
        type,
        status,
        cancelReason,
      ],
    )
  }
  return n
}

/** Insert a synthetic order and return its id. */
async function insertOrder(
  client,
  { name, email, adults, children, refundStatus, piSuffix, showId, locale },
) {
  const res = await client.query(
    `INSERT INTO orders
       (buyer_name, email, adult_count, child_count, total,
        stripe_payment_intent_id, refund_status, show_id, locale, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'online')
     RETURNING id`,
    [
      name,
      email,
      adults,
      children,
      adults * ADULT_CENTS + children * CHILD_CENTS,
      `${PI_PREFIX}${piSuffix}`,
      refundStatus,
      showId,
      locale,
    ],
  )
  return res.rows[0].id
}

/**
 * Idempotently upsert the fixture partner, keyed on its (fake) name. Returns
 * the partner id. Re-running refreshes the fixture's fields in place rather
 * than stacking duplicate rows. The columns are snake_case per Payload's
 * drizzle convention (see db/schema/app.sql `partners`).
 */
async function upsertPartner(client, p) {
  const existing = await client.query(`SELECT id FROM partners WHERE name = $1`, [p.name])
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id
    await client.query(
      `UPDATE partners
         SET oib = $2, billing_address = $3, commission_percent = $4,
             active = $5, updated_at = now()
       WHERE id = $1`,
      [id, p.oib, p.billingAddress, p.commissionPercent, p.active],
    )
    return id
  }
  const res = await client.query(
    `INSERT INTO partners (name, oib, billing_address, commission_percent, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [p.name, p.oib, p.billingAddress, p.commissionPercent, p.active],
  )
  return res.rows[0].id
}

/**
 * Idempotently upsert a Payload-auth user (raw SQL). `role` is the
 * enum_users_role label (superadmin|admin|tehnika|partner — see
 * src/lib/access/roles.ts; the app.sql DDL header is stale). `partnerId` links
 * a partner-role login to its partners row via users.partner_id.
 *
 * Only the columns we're certain of are written: email, hash, salt, role,
 * partner_id, updated_at, created_at. Payload's other auth columns
 * (reset_password_*, login_attempts, lock_until) are nullable and left to their
 * DB defaults. The password is re-hashed on every run so the documented dev
 * credential always wins, even if someone changed it through /admin.
 */
async function upsertUser(client, { email, role, partnerId = null }) {
  const { salt, hash } = payloadPasswordSaltHash(SEED_PASSWORD)
  const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [email])
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id
    await client.query(
      `UPDATE users
         SET hash = $2, salt = $3, role = $4, partner_id = $5, updated_at = now()
       WHERE id = $1`,
      [id, hash, salt, role, partnerId],
    )
    return id
  }
  const res = await client.query(
    `INSERT INTO users (email, hash, salt, role, partner_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [email, hash, salt, role, partnerId],
  )
  return res.rows[0].id
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
    // tickets.order_id is ON DELETE SET NULL, so tickets must go before orders
    // or we'd orphan them; orders.show_id forces orders before shows.
    const delTickets = await client.query(`DELETE FROM tickets WHERE token LIKE $1`, [
      `${TOKEN_PREFIX}%`,
    ])
    const delOrders = await client.query(
      `DELETE FROM orders WHERE stripe_payment_intent_id LIKE $1`,
      [`${PI_PREFIX}%`],
    )
    const delShows = await client.query(`DELETE FROM shows WHERE time = $1`, [SEED_TIME_MARKER])
    console.log(
      `[seed-staging] cleared prior seed rows: ${delTickets.rowCount} tickets, ` +
        `${delOrders.rowCount} orders, ${delShows.rowCount} shows.`,
    )

    // ─── 2. Awkward shows ─────────────────────────────────────────────────
    // All carry time = SEED_TIME_MARKER so they're recognizably ours on the
    // next run. The "today" show's date is genuinely today so getNextShow()
    // and the door flow have a live target. online_sold is left 0 — seats now
    // come from active ticket rows, not this retired counter.

    const todayShow = await client.query(
      `INSERT INTO shows (date, time, venue, online_sold, in_person_sold, status)
       VALUES ($1, $2, 'ljetno-kino', 0, 0, 'active')
       RETURNING id`,
      [todayAt(21, 0), SEED_TIME_MARKER],
    )
    const todayShowId = todayShow.rows[0].id

    const cancelledShow = await client.query(
      `INSERT INTO shows (date, time, venue, online_sold, in_person_sold, status)
       VALUES ($1, $2, 'ljetno-kino', 0, 0, 'cancelled')
       RETURNING id`,
      [todayAt(20, 0), SEED_TIME_MARKER],
    )
    const cancelledShowId = cancelledShow.rows[0].id

    // Sold-out: remaining = capacity − COUNT(active tickets) − in_person_sold
    // − legacy_reserved (src/lib/shows.ts). With no tickets, in_person_sold ==
    // capacity drives remaining to 0. Future date so it would otherwise list.
    const soldOutCap = VENUE_CAPACITY['zimsko-kino']
    const soldOutDate = new Date()
    soldOutDate.setDate(soldOutDate.getDate() + 7)
    soldOutDate.setHours(21, 0, 0, 0)
    const soldOutShow = await client.query(
      `INSERT INTO shows (date, time, venue, online_sold, in_person_sold, status)
       VALUES ($1, $2, 'zimsko-kino', 0, $3, 'active')
       RETURNING id`,
      [soldOutDate.toISOString(), SEED_TIME_MARKER, soldOutCap],
    )
    const soldOutShowId = soldOutShow.rows[0].id

    console.log(
      `[seed-staging] shows: today=${todayShowId} (active), ` +
        `cancelled=${cancelledShowId}, sold-out=${soldOutShowId} ` +
        `(in_person_sold=${soldOutCap}/${soldOutCap}).`,
    )

    // ─── 3. Awkward orders + per-person tickets ───────────────────────────

    // (a) Adults-only order on the today show → 3 active adult tickets, all
    //     unscanned (VALID).
    const orderAId = await insertOrder(client, {
      name: 'Test Buyer A',
      email: 'test-a@example.invalid',
      adults: 3,
      children: 0,
      refundStatus: 'none',
      piSuffix: '1',
      showId: todayShowId,
      locale: 'en',
    })
    const ticketsA = await insertPersonTickets(client, {
      orderId: orderAId,
      letter: 'A',
      adults: 3,
      children: 0,
    })

    // (b) Refunded order on the today show (2 adult + 1 child) → all tickets
    //     cancelled with reason 'refund' (CANCELLED on scan; seats freed).
    const orderBId = await insertOrder(client, {
      name: 'Test Buyer B',
      email: 'test-b@example.invalid',
      adults: 2,
      children: 1,
      refundStatus: 'refunded',
      piSuffix: '2',
      showId: todayShowId,
      locale: 'hr',
    })
    const ticketsB = await insertPersonTickets(client, {
      orderId: orderBId,
      letter: 'B',
      adults: 2,
      children: 1,
      status: 'cancelled',
      cancelReason: 'refund',
    })

    // (c) Door order on the today show (4 adult + 2 child) → 6 active tickets,
    //     first pre-scanned (ALREADY_SCANNED), rest unscanned (VALID).
    const orderCId = await insertOrder(client, {
      name: 'Test Buyer C',
      email: 'test-c@example.invalid',
      adults: 4,
      children: 2,
      refundStatus: 'none',
      piSuffix: '3',
      showId: todayShowId,
      locale: 'en',
    })
    const ticketsC = await insertPersonTickets(client, {
      orderId: orderCId,
      letter: 'C',
      adults: 4,
      children: 2,
      scannedCount: 1,
    })

    // ─── 4. Staging logins + fixture partner (issue #197) ─────────────────
    // Without these the staging DB has 0 users, so /admin, authed /scan +
    // stats, and the partner dashboard are all untestable. Upserts (keyed on
    // partner name / user email) keep this idempotent alongside the
    // delete-then-reinsert show/order fixtures above. All writes are inside the
    // same staging-guarded transaction.
    const partnerId = await upsertPartner(client, SEED_PARTNER)

    const seededUsers = []
    for (const u of SEED_USERS) {
      const id = await upsertUser(client, {
        email: u.email,
        role: u.role,
        // Only the partner-role login is bound to the fixture partner.
        partnerId: u.role === 'partner' ? partnerId : null,
      })
      seededUsers.push({ ...u, id })
    }

    await client.query('COMMIT')

    console.log(
      `[seed-staging] partner: id=${partnerId} "${SEED_PARTNER.name}" ` +
        `(commission ${SEED_PARTNER.commissionPercent}%, active=${SEED_PARTNER.active}).`,
    )
    console.log('[seed-staging] logins (all password "' + SEED_PASSWORD + '"):')
    for (const u of seededUsers) {
      const link = u.role === 'partner' ? ` → partner_id=${partnerId}` : ''
      console.log(`[seed-staging]   ${u.email}  role=${u.role}  id=${u.id}${link}`)
    }

    console.log('[seed-staging] orders + per-person tickets:')
    console.log(
      `[seed-staging]   A order=${orderAId} adults-only, ${ticketsA} active tickets ` +
        `(${TOKEN_PREFIX}A1..A${ticketsA}) → /scan VALID`,
    )
    console.log(
      `[seed-staging]   B order=${orderBId} refunded, ${ticketsB} cancelled tickets ` +
        `(${TOKEN_PREFIX}B1..B${ticketsB}) → /scan CANCELLED`,
    )
    console.log(
      `[seed-staging]   C order=${orderCId} door, ${ticketsC} active tickets ` +
        `(${TOKEN_PREFIX}C1 scanned → ALREADY_SCANNED, C2..C${ticketsC} → VALID)`,
    )
    console.log(
      `[seed-staging] today show active seats = ${ticketsA + ticketsC} ` +
        `(A ${ticketsA} + C ${ticketsC}; B's ${ticketsB} cancelled are excluded).`,
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
