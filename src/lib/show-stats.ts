import { VENUE_CAPACITY, type Venue } from './venues'
import { remainingSeats } from './tickets/seat-availability'
import type { StatsShow } from './stats'

export interface ShowStatsToken {
  token: string
  scanned: boolean
  scannedAt: string | null
}

export interface ShowStatsOrder {
  id: string
  buyerName: string
  email: string
  adultCount: number
  childCount: number
  totalCents: number
  refunded: boolean
  /** Order channel (ADR-0008/0019). Absent/legacy rows are treated as 'online'. */
  channel?: 'online' | 'partner' | 'comp'
  tokens: ShowStatsToken[]
}

export interface ShowStatsInput {
  show: StatsShow
  orders: ShowStatsOrder[]
}

export interface ShowStatsHeader {
  date: string
  time: string
  venue: Venue
  status: 'active' | 'cancelled'
  onlineSold: number
  inPersonSold: number
  /** Comp (goodwill) seats issued for this show (channel='comp', ADR-0019). Real
   *  people at the door, but never revenue: kept apart from onlineSold so seat
   *  math reconciles (online + inPerson + comp + legacyReserved + remaining =
   *  capacity) without a comp ever landing in a money figure. */
  compSold: number
  legacyReserved: number
  totalSold: number
  scanned: number
  capacity: number
  remaining: number
  revenueCents: number
}

export interface ShowStatsOrderRow {
  id: string
  buyerName: string
  email: string
  ticketCount: number
  refunded: boolean
  tokens: ShowStatsToken[]
}

export interface ShowStatsOutput {
  header: ShowStatsHeader
  orders: ShowStatsOrderRow[]
}

export function computeShowStats(input: ShowStatsInput): ShowStatsOutput {
  const { show, orders } = input
  const capacity = VENUE_CAPACITY[show.venue]

  // "Scanned" = people through the door. Under the per-person ticket model
  // (ADR-0007) each ticket is one person, so this is a COUNT of scanned
  // tickets — consistent with the season view (stats-data) and
  // getScannedPeopleForShow. `tokens` here are the order's active tickets.
  let scanned = 0
  let revenueCents = 0
  let compSold = 0
  for (const o of orders) {
    scanned += o.tokens.filter((t) => t.scanned).length
    if (!o.refunded) revenueCents += o.totalCents
    // Comp seats (channel='comp', ADR-0019): tokens here are already active-only,
    // so their count is the live comp seat count. total=0, so they never touch
    // revenueCents above — the count is broken out purely for seat reconciliation.
    if (o.channel === 'comp') compSold += o.tokens.length
  }

  return {
    header: {
      date: show.date,
      time: show.time,
      venue: show.venue,
      status: show.status,
      // `onlineSold` is the admin-facing display column: the live active-ticket
      // count MINUS comp seats, so comps show in their own column and the seat
      // math still reconciles against capacity (partner seats stay folded in
      // here, as before — #322 only pulls comps out).
      onlineSold: show.activeTicketCount - compSold,
      inPersonSold: show.inPersonSold,
      compSold,
      legacyReserved: show.legacyReserved,
      totalSold: show.activeTicketCount + show.inPersonSold,
      scanned,
      capacity,
      remaining: remainingSeats({
        capacity,
        activeTicketCount: show.activeTicketCount,
        inPersonSold: show.inPersonSold,
        legacyReserved: show.legacyReserved,
      }),
      revenueCents,
    },
    orders: orders.map((o) => ({
      id: o.id,
      buyerName: o.buyerName,
      email: o.email,
      ticketCount: o.adultCount + o.childCount,
      refunded: o.refunded,
      tokens: o.tokens,
    })),
  }
}
