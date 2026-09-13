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
import type { Venue } from '@/lib/venues'
import { emptySales, type PerformanceSales } from './sales-view'

/**
 * Non-refunded order money per show, in cents.
 *
 * A refunded order is money that went back, so it is not this evening's take;
 * a comp order carries `total = 0` and adds nothing by arithmetic rather than
 * by a filter, which is what keeps a goodwill seat out of every money figure
 * without a second rule to remember (ADR-0019).
 */
async function ticketRevenueByShow(query: PoolQuery): Promise<Map<string, number>> {
  const res = await query(
    `SELECT o.show_id AS show_id, COALESCE(SUM(o.total), 0)::bigint AS revenue
     FROM orders o
     JOIN shows s ON s.id = o.show_id
     WHERE o.refund_status <> 'refunded' AND ${publicPerformanceSql('s')}
     GROUP BY o.show_id`,
  )
  const byShow = new Map<string, number>()
  for (const row of res.rows) byShow.set(String(row.show_id), Number(row.revenue) || 0)
  return byShow
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

  const [states, channels, offline, scanned, revenue] = await Promise.all([
    performanceStates(query),
    getActiveTicketCountsByShowAndChannel(query),
    getOfflineTotalsByShow(query),
    getScannedTicketCountsByShow(query),
    ticketRevenueByShow(query),
  ])

  for (const [id, sales] of states) {
    const channel = channels.get(id)
    const lines = offline.get(id)
    sales.online = channel?.online ?? 0
    sales.partner = channel?.partner ?? 0
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
