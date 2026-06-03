import { VENUE_CAPACITY, type Venue } from './venues'
import { remainingSeats } from './tickets/seat-availability'

export interface StatsShow {
  id: string
  date: string // ISO date (YYYY-MM-DD or full ISO)
  time: string
  venue: Venue
  /** Live COUNT of active tickets (the shows.online_sold counter is retired). */
  activeTicketCount: number
  inPersonSold: number
  legacyReserved: number
  scannedCount: number
  status: 'active' | 'cancelled'
}

export interface StatsInput {
  today: Date
  shows: StatsShow[]
  totalRevenueCents: number
}

export interface VenueAgg {
  sold: number
  scanned: number
}

export interface StatsHeader {
  totalSold: number
  totalScanned: number
  totalRevenueCents: number
  byVenue: Record<Venue, VenueAgg>
}

export interface StatsRow {
  id: string
  date: string
  time: string
  venue: Venue
  capacity: number
  onlineSold: number
  inPersonSold: number
  legacyReserved: number
  scanned: number
  remaining: number
  status: 'active' | 'cancelled'
}

export interface StatsOutput {
  header: StatsHeader
  rows: StatsRow[]
}

export function computeStats(input: StatsInput): StatsOutput {
  const byVenue: Record<Venue, VenueAgg> = {
    'ljetno-kino': { sold: 0, scanned: 0 },
    'zimsko-kino': { sold: 0, scanned: 0 },
  }
  let totalSold = 0
  let totalScanned = 0

  for (const s of input.shows) {
    const sold = s.activeTicketCount + s.inPersonSold
    totalSold += sold
    totalScanned += s.scannedCount
    byVenue[s.venue].sold += sold
    byVenue[s.venue].scanned += s.scannedCount
  }

  const cutoff = new Date(input.today)
  cutoff.setUTCHours(0, 0, 0, 0)
  cutoff.setUTCDate(cutoff.getUTCDate() - 7)

  const rows: StatsRow[] = input.shows
    .filter((s) => new Date(s.date) >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      id: s.id,
      date: s.date,
      time: s.time,
      venue: s.venue,
      capacity: VENUE_CAPACITY[s.venue],
      // `onlineSold` is the admin-facing display column; its value is the live
      // active-ticket count.
      onlineSold: s.activeTicketCount,
      inPersonSold: s.inPersonSold,
      legacyReserved: s.legacyReserved,
      scanned: s.scannedCount,
      remaining: remainingSeats({
        capacity: VENUE_CAPACITY[s.venue],
        activeTicketCount: s.activeTicketCount,
        inPersonSold: s.inPersonSold,
        legacyReserved: s.legacyReserved,
      }),
      status: s.status,
    }))

  return {
    header: {
      totalSold,
      totalScanned,
      totalRevenueCents: input.totalRevenueCents,
      byVenue,
    },
    rows,
  }
}
