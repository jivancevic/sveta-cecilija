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
      // Seats sold across channels. Neither offline source has ticket rows.
      //
      // `legacyReserved` used to be excluded here as "a reservation, not a
      // sale", which disagreed with the member dashboard and understated the
      // 2026 season by the 137 seats the old site sold for 18.05 and 25.05.
      // Those were completed, paid sales on a system that is now closed and can
      // never take another booking, so they are sales (ADR-0025) and the two
      // dashboards now agree.
      sold: s.activeTicketCount + s.inPersonSold + s.legacyReserved,
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
