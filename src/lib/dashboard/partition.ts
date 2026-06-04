// Pure show-partitioning logic for the secretary's /admin landing (#238, ADR-0015).
//
// The dashboard leads with upcoming shows (hero + fill bars) and collapses past
// shows to a de-emphasised reference list. This module owns the upcoming/past
// split so the partition rule lives in one tested place rather than in JSX.
//
// "Upcoming" = date >= today compared at midnight (today's show is upcoming,
// matching getUpcomingShows / CONTEXT.md "Performance visibility"). Anything
// strictly before today is past. Upcoming is sorted soonest-first; past is
// sorted most-recent-first (the freshest reference rows on top). The two sets
// never interleave.

import type { Venue } from '../venues'

export interface DashboardShow {
  id: string
  date: string // YYYY-MM-DD
  time: string
  venue: Venue
  /** Seats sold across channels: active tickets + in-person. */
  sold: number
  /** VENUE_CAPACITY[venue]. */
  capacity: number
  /** Seats still sellable (may be negative if oversold). */
  remaining: number
  status: 'active' | 'cancelled'
}

export interface ShowPartition {
  upcoming: DashboardShow[]
  past: DashboardShow[]
}

/** YYYY-MM-DD for the given date in UTC (dates are date-only, compared at midnight). */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function partitionShows({
  today,
  shows,
}: {
  today: Date
  shows: DashboardShow[]
}): ShowPartition {
  const todayKey = dayKey(today)

  const upcoming = shows
    .filter((s) => s.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))

  const past = shows
    .filter((s) => s.date < todayKey)
    .sort((a, b) => b.date.localeCompare(a.date))

  return { upcoming, past }
}
