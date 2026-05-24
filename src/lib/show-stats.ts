import { VENUE_CAPACITY, type Venue } from './venues'
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

  let scanned = 0
  let revenueCents = 0
  for (const o of orders) {
    for (const t of o.tokens) if (t.scanned) scanned++
    if (!o.refunded) revenueCents += o.totalCents
  }

  return {
    header: {
      date: show.date,
      time: show.time,
      venue: show.venue,
      status: show.status,
      onlineSold: show.onlineSold,
      inPersonSold: show.inPersonSold,
      totalSold: show.onlineSold + show.inPersonSold,
      scanned,
      capacity,
      remaining: capacity - show.onlineSold - show.inPersonSold,
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
