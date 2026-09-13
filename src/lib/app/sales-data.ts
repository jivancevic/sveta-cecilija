// What Izvedbe loads for a `tickets` holder (#502).
//
// The IO wiring and nothing else, in the `orders-data.ts` shape: every rule
// about what a number MEANS lives in `sales-view.ts`, every rule about what
// counts as a seat lives in `tickets/sold-seats.ts` and `offline-sales/`, and
// this file only asks four questions and folds the answers together.
//
// It reaches the database through `getRepo().db.query` (ADR-0027 decision 5),
// so it imports no Payload and needs no entry in the repo guard's allow-list.
// The raw-table stores keep taking a `PoolQuery`, which is the second rule of
// the seam: the SQL stays in the module that owns it.
//
// Two rules from elsewhere are honoured here rather than restated:
//
//   - **Capacity reads the cached counters, money reads the ledger**
//     (ADR-0025). The door and legacy SEAT counts come from
//     `getOfflineTotalsByShow`, which sums the ledger itself, so a counter that
//     has drifted from its lines cannot quietly become the number on screen.
//   - **Never SUM a money column across a join to tickets** — that multiplies
//     the total by the party size. The revenue query below touches `orders`
//     alone and groups by `show_id`.
//
// Every query carries the public-performance predicate: a non-public row sells
// nothing, so it has no sales to read (ADR-0024).

import { getRepo } from '@/lib/repo'
import { publicPerformanceSql } from '@/lib/show-performance'
import { getOfflineTotalsByShow } from '@/lib/offline-sales/data'
import {
  getActiveTicketCountsByShowAndChannel,
  getScannedTicketCountsByShow,
  type PoolQuery,
} from '@/lib/tickets/sold-seats'
import type { OrderChannel, RefundStatus } from '@/lib/dashboard/revenue'
import type { Venue } from '@/lib/venues'
import { emptySales, onlineRevenueByShow, type PerformanceSales } from './sales-view'

/**
 * Collected order money per show, in cents: ONLINE orders, net of refunds.
 *
 * The channel clause is the correctness of the figure, not an optimisation
 * (#538). A partner order stores `total` at FACE VALUE the moment the reseller
 * issues the seat (ADR-0008), and the society sees none of it until the monthly
 * obračun; worse, a storno voids the TICKETS and touches neither `total` nor
 * `refund_status`, so a cancelled partner sale would sit in this evening's take
 * for ever with nothing on the order row to betray it. A comp order carries
 * `total = 0` (ADR-0019) and is excluded by the same clause rather than by a
 * second rule to remember.
 *
 * The rows come back per order rather than pre-summed, so the arithmetic is
 * `revenueCollectedCents` — the one definition of collected money — applied per
 * evening in `onlineRevenueByShow`, where it is unit-tested. `orders` alone,
 * plus the one-to-one join to `shows`: never a join to `tickets`, which would
 * multiply each total by the party size. The partner half of the evening is not
 * lost, it is read separately by `partnerTicketsByShow` and shown as a
 * receivable.
 */
async function ticketRevenueByShow(query: PoolQuery): Promise<Map<string, number>> {
  const res = await query(
    `SELECT o.show_id AS show_id, o.channel AS channel, o.total AS total,
            o.refund_status AS refund_status
     FROM orders o
     JOIN shows s ON s.id = o.show_id
     WHERE o.channel = 'online' AND ${publicPerformanceSql('s')}`,
  )
  return onlineRevenueByShow(
    res.rows.map((row) => ({
      showId: String(row.show_id),
      // Rows that predate the column are online by definition, the same fold
      // `sold-seats.ts` does for the channel counts.
      channel: ((row.channel as OrderChannel) ?? 'online') as OrderChannel,
      totalCents: Number(row.total) || 0,
      refundStatus: ((row.refund_status as RefundStatus) ?? 'none') as RefundStatus,
    })),
  )
}

/**
 * Active PARTNER tickets per show, split adult/child (#538).
 *
 * The split, not the money: the €20/€10 arithmetic is
 * `partnerFaceValueCents`, so the one line that names these euros is a tested
 * pure function rather than a SQL expression. Same predicate as the channel
 * counts (`status='active'`, `channel='partner'`), so the seat count in the
 * note and the Partner number above it cannot disagree.
 */
async function partnerTicketsByShow(query: PoolQuery): Promise<Map<string, PartnerSplit>> {
  const res = await query(
    `SELECT o.show_id AS show_id, t.type AS type, COUNT(*)::int AS seats
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     JOIN shows s ON s.id = o.show_id
     WHERE t.status = 'active' AND o.channel = 'partner' AND ${publicPerformanceSql('s')}
     GROUP BY o.show_id, t.type`,
  )
  const byShow = new Map<string, PartnerSplit>()
  for (const row of res.rows) {
    const showId = String(row.show_id)
    const entry = byShow.get(showId) ?? { adult: 0, child: 0 }
    const seats = Number(row.seats) || 0
    if (String(row.type) === 'child') entry.child += seats
    else entry.adult += seats
    byShow.set(showId, entry)
  }
  return byShow
}

interface PartnerSplit {
  adult: number
  child: number
}

/** The facts that live on the shows row itself: the house and the three states. */
async function performanceStates(query: PoolQuery): Promise<Map<string, PerformanceSales>> {
  const res = await query(
    `SELECT s.id, s.venue, s.status, s.online_sales_paused, s.venue_changed_at, s.date_changed_at
     FROM shows s
     WHERE ${publicPerformanceSql('s')}`,
  )
  const byShow = new Map<string, PerformanceSales>()
  for (const row of res.rows) {
    const id = String(row.id)
    // The save validation guarantees a public row has a venue; a row that
    // somehow has none is read as Ljetno rather than dropped, because a
    // performance missing from this map would render as "no sales at all".
    const venue = (typeof row.venue === 'string' ? row.venue : 'ljetno-kino') as Venue
    byShow.set(id, {
      ...emptySales(id, venue),
      paused: row.online_sales_paused === true,
      cancelled: row.status === 'cancelled',
      moved: row.venue_changed_at != null,
      rescheduled: row.date_changed_at != null,
    })
  }
  return byShow
}

/**
 * Every public performance's sales, keyed by show id.
 *
 * Five season-wide aggregates rather than five per-row queries: the screen
 * needs the whole list at once, and a per-row read would be one round trip per
 * evening on the page a secretary opens twenty times a week. The detail page
 * asks for the same map and picks one row out of it, so the number beside an
 * evening in the list and the number on its own page are the same number.
 */
export async function loadSeasonSales(): Promise<Map<string, PerformanceSales>> {
  const query = getRepo().db.query

  const [states, channels, offline, scanned, revenue, partnerSplit] = await Promise.all([
    performanceStates(query),
    getActiveTicketCountsByShowAndChannel(query),
    getOfflineTotalsByShow(query),
    getScannedTicketCountsByShow(query),
    ticketRevenueByShow(query),
    partnerTicketsByShow(query),
  ])

  for (const [id, sales] of states) {
    const channel = channels.get(id)
    const lines = offline.get(id)
    const partner = partnerSplit.get(id)
    sales.online = channel?.online ?? 0
    sales.partner = channel?.partner ?? 0
    sales.partnerAdult = partner?.adult ?? 0
    sales.partnerChild = partner?.child ?? 0
    sales.comp = channel?.comp ?? 0
    sales.door = lines?.door.seats ?? 0
    sales.legacy = lines?.legacy.seats ?? 0
    sales.scanned = scanned.get(id) ?? 0
    sales.ticketRevenueCents = revenue.get(id) ?? 0
    sales.offlineRevenueCents = (lines?.door.revenueCents ?? 0) + (lines?.legacy.revenueCents ?? 0)
  }

  return states
}

/** One evening's sales, or null when it is not a public performance. */
export async function loadPerformanceSales(id: string): Promise<PerformanceSales | null> {
  return (await loadSeasonSales()).get(id) ?? null
}
