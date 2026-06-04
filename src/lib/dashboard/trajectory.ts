// Pure season-trajectory series for the secretary dashboard bar chart (#242).
//
// One bar per show across the whole season, chronological. The bar's height is
// tickets sold; a faint capacity ceiling sits behind it. Bars are scaled to a
// shared y-axis (`maxCapacity`) so the busiest venue's ceiling is the tallest —
// a ljetno-kino (320) show reads taller than a zimsko-kino (250) one, keeping
// the comparison honest. The render math (px heights) lives in the component;
// this module owns the testable series + the scale.

import type { DashboardShow } from './partition'
import { fillPercent } from './capacity'
import type { Venue } from '../venues'

export interface TrajectoryBar {
  id: string
  date: string // YYYY-MM-DD
  time: string
  venue: Venue
  sold: number
  capacity: number
  remaining: number
  /** Sold as a whole-number % of this show's capacity, clamped to 0..100. */
  percent: number
  cancelled: boolean
}

export interface SeasonTrajectory {
  /** One bar per show, sorted soonest-first across the whole season. */
  bars: TrajectoryBar[]
  /** Tallest venue capacity in the season — the shared y-axis ceiling. */
  maxCapacity: number
}

export function seasonTrajectory(shows: DashboardShow[]): SeasonTrajectory {
  const bars: TrajectoryBar[] = shows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      id: s.id,
      date: s.date,
      time: s.time,
      venue: s.venue,
      sold: s.sold,
      capacity: s.capacity,
      remaining: s.remaining,
      percent: fillPercent(s.sold, s.capacity),
      cancelled: s.status === 'cancelled',
    }))

  const maxCapacity = bars.reduce((max, b) => Math.max(max, b.capacity), 0)

  return { bars, maxCapacity }
}
