// Adapter: StatsShow[] (the un-windowed season input from getStatsInput) →
// DashboardShow[] for the secretary's landing (#238).
//
// computeStats() windows rows to last-7-days+future for the old table; the
// dashboard needs the *whole* season to partition upcoming/past and roll up
// season capacity, so it maps the raw StatsShow input instead. Seat math reuses
// remainingSeats — the single source of truth for remaining = capacity − sold −
// in-person − legacy.

import type { StatsShow } from '../stats'
import { VENUE_CAPACITY } from '../venues'
import { remainingSeats } from '../tickets/seat-availability'
import type { DashboardShow } from './partition'

export function toDashboardShows(shows: StatsShow[]): DashboardShow[] {
  return shows.map((s) => {
    const capacity = VENUE_CAPACITY[s.venue]
    return {
      id: s.id,
      date: s.date,
      time: s.time,
      venue: s.venue,
      // Seats sold across channels (in-person has no ticket rows; legacy is a
      // reservation, not a sale, so it's not counted as sold).
      sold: s.activeTicketCount + s.inPersonSold,
      capacity,
      remaining: remainingSeats({
        capacity,
        activeTicketCount: s.activeTicketCount,
        inPersonSold: s.inPersonSold,
        legacyReserved: s.legacyReserved,
      }),
      status: s.status,
    }
  })
}
