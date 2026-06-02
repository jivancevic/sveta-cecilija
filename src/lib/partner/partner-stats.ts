// Pure dashboard stats for a partner (ADR-0008, #146). Turns a flat list of the
// partner's own ticket rows + recent orders into the three things the partner
// dashboard shows: season total active tickets, per-show active counts, and a
// short list of recent sales. No DB access — the data layer wires the queries
// and passes plain arrays, so this is unit-testable in isolation.
//
// "Active" = a ticket still occupying a seat (status 'active'); cancelled
// tickets (storno/refund) are excluded from the seat counts.

import type { TicketType } from './partner-reconciliation'

export interface StatsTicketRow {
  showId: string
  showLabel: string
  type: TicketType
  status: 'active' | 'cancelled'
}

export interface PerShowCount {
  showId: string
  showLabel: string
  adults: number
  children: number
  total: number
}

export interface RecentSale {
  orderId: string
  code: string | null
  showLabel: string
  /** order.created_at ISO string. */
  createdAt: string
  adultCount: number
  childCount: number
  totalCents: number
}

export interface PartnerSeasonStats {
  totalActive: number
  perShow: PerShowCount[]
}

/**
 * Season totals from the partner's active ticket rows. Per-show lines are
 * sorted by label for stable display; shows with zero active tickets simply
 * don't appear.
 */
export function computeSeasonStats(rows: StatsTicketRow[]): PartnerSeasonStats {
  const byShow = new Map<string, PerShowCount>()
  let totalActive = 0

  for (const row of rows) {
    if (row.status !== 'active') continue
    let line = byShow.get(row.showId)
    if (!line) {
      line = { showId: row.showId, showLabel: row.showLabel, adults: 0, children: 0, total: 0 }
      byShow.set(row.showId, line)
    }
    if (row.type === 'adult') line.adults += 1
    else line.children += 1
    line.total += 1
    totalActive += 1
  }

  const perShow = [...byShow.values()].sort((a, b) =>
    a.showLabel.localeCompare(b.showLabel) || a.showId.localeCompare(b.showId),
  )
  return { totalActive, perShow }
}
