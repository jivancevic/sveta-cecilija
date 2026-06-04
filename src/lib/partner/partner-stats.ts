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
  /** ISO 'YYYY-MM-DD' show date, for the Statistika chart axis + chronological sort. */
  showDate: string
  type: TicketType
  status: 'active' | 'cancelled'
}

export interface PerShowCount {
  showId: string
  showLabel: string
  showDate: string
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

/** One bar in the Statistika chart — every season izvedba, sold or not. */
export interface StatBar {
  showId: string
  showDate: string
  adults: number
  children: number
  total: number
}

/**
 * Build the Statistika bars: ALL season performances (so the partner sees the
 * whole schedule, not just the ones they sold), each carrying the partner's own
 * sold counts (0 where they sold none). Chronological by show date.
 */
export function buildStatistikaBars(
  allShows: Array<{ showId: string; showDate: string }>,
  perShow: PerShowCount[],
): StatBar[] {
  const byShow = new Map(perShow.map((p) => [p.showId, p]))
  return [...allShows]
    .map((s) => {
      const sold = byShow.get(s.showId)
      return {
        showId: s.showId,
        showDate: s.showDate,
        adults: sold?.adults ?? 0,
        children: sold?.children ?? 0,
        total: sold?.total ?? 0,
      }
    })
    .sort((a, b) => a.showDate.localeCompare(b.showDate) || a.showId.localeCompare(b.showId))
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
      line = { showId: row.showId, showLabel: row.showLabel, showDate: row.showDate, adults: 0, children: 0, total: 0 }
      byShow.set(row.showId, line)
    }
    if (row.type === 'adult') line.adults += 1
    else line.children += 1
    line.total += 1
    totalActive += 1
  }

  // Chronological (by show date) so the Statistika bars read left-to-right in time.
  const perShow = [...byShow.values()].sort((a, b) =>
    a.showDate.localeCompare(b.showDate) || a.showId.localeCompare(b.showId),
  )
  return { totalActive, perShow }
}
