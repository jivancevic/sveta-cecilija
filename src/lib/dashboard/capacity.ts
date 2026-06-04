// Pure capacity / fill-bar math for the secretary's /admin landing (#238).
//
// Per-show fill drives the hero + smaller fill bars (sold vs venue capacity,
// remaining seats). Season capacity drives the persistent summary band's
// "% of season capacity" figure. There is no per-show capacity field — capacity
// is always VENUE_CAPACITY[venue], already folded into DashboardShow.capacity.
// Cancelled shows don't count toward season capacity (no seats to sell).

import type { DashboardShow } from './partition'

export type { DashboardShow }

export interface ShowFill {
  sold: number
  capacity: number
  remaining: number
  /** Sold as a whole-number % of capacity, clamped to 0..100. */
  percent: number
}

/** Fill % of one show, clamped to 0..100 and guarded against zero capacity. */
function fillPercent(sold: number, capacity: number): number {
  if (capacity <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((sold / capacity) * 100)))
}

export function showFill(show: DashboardShow): ShowFill {
  return {
    sold: show.sold,
    capacity: show.capacity,
    remaining: show.remaining,
    percent: fillPercent(show.sold, show.capacity),
  }
}

export interface SeasonCapacity {
  totalSold: number
  totalCapacity: number
  /** totalSold as a whole-number % of totalCapacity, clamped to 0..100. */
  percent: number
}

/** Season-wide sold / capacity rollup. Cancelled shows are excluded. */
export function seasonCapacity(shows: DashboardShow[]): SeasonCapacity {
  let totalSold = 0
  let totalCapacity = 0
  for (const s of shows) {
    if (s.status === 'cancelled') continue
    totalSold += s.sold
    totalCapacity += s.capacity
  }
  return { totalSold, totalCapacity, percent: fillPercent(totalSold, totalCapacity) }
}
