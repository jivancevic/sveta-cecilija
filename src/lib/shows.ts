import { getPayload } from 'payload'
import config from '@payload-config'
import { VENUE_CAPACITY, type Venue } from './venues'
import {
  getActiveTicketCountsByShow,
  getActiveTicketCountForShow,
  getScannedTicketCountForShow,
} from './tickets/sold-seats'
import { remainingSeats } from './tickets/seat-availability'
import { isPastShowCutoff } from './show-time'

export { VENUE_CAPACITY, type Venue }

export interface Show {
  id: string;
  date: string;      // YYYY-MM-DD
  time: string;
  venue: Venue;
  remaining: number; // venue capacity - onlineSold - inPersonSold - legacyReserved
}

export interface NextShow {
  id: string
  date: string // YYYY-MM-DD
  time: string
  venue: Venue
  onlineSold: number
  inPersonSold: number
}

type PoolQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

/**
 * Next active show with date >= today, ordered by date ASC.
 * Returns null if no future show exists. Tehnika dashboard surface.
 */
export async function getNextShow(): Promise<NextShow | null> {
  const payload = await getPayload({ config })
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const result = await payload.find({
    collection: 'shows',
    where: {
      and: [
        { status: { equals: 'active' } },
        { date: { greater_than_equal: todayStart.toISOString() } },
      ],
    },
    sort: 'date',
    limit: 1,
    depth: 0,
  })

  const doc = result.docs[0]
  if (!doc) return null

  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  // `onlineSold` is now the active ticket count, not the retired column.
  const onlineSold = await getActiveTicketCountForShow((sql, params) => pool.query(sql, params), doc.id as number)

  return {
    id: String(doc.id),
    date: new Date(doc.date as string).toISOString().slice(0, 10),
    time: (doc.time as string) ?? '',
    venue: (doc.venue as Venue) ?? 'ljetno-kino',
    onlineSold,
    inPersonSold: Number(doc.inPersonSold ?? 0),
  }
}

/**
 * Number of people scanned in for the given show. Under the per-person ticket
 * model (ADR-0007) each active ticket is one person, so this is a plain COUNT
 * of scanned active tickets — not a SUM of party sizes. Cancelled tickets are
 * excluded.
 */
export async function getScannedPeopleForShow(showId: number | string): Promise<number> {
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  return getScannedTicketCountForShow((sql, params) => pool.query(sql, params), showId)
}

export async function getUpcomingShows(limit?: number): Promise<Show[]> {
  const payload = await getPayload({ config })
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // The DB filter is day-granular (date is a dayOnly value at midnight UTC), so
  // it keeps today's shows even after they start. We narrow to the exact cutoff
  // (start + 1h, Europe/Zagreb) in JS below. Fetch the full window first and
  // apply the caller's `limit` only AFTER filtering, so a show that has just
  // passed its cutoff can't push a still-upcoming show out of a small limit.
  const result = await payload.find({
    collection: 'shows',
    where: {
      and: [
        { status: { equals: 'active' } },
        { date: { greater_than_equal: todayStart.toISOString() } },
      ],
    },
    sort: 'date',
    limit: 200,
    depth: 0,
  })

  // Sold seats come from active ticket rows, not the retired online_sold column.
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const soldByShow = await getActiveTicketCountsByShow((sql, params) => pool.query(sql, params))

  const shows = result.docs
    .map((show) => {
      const venue = (show.venue as Venue) ?? 'ljetno-kino'
      const capacity = VENUE_CAPACITY[venue]
      const sold = soldByShow.get(String(show.id)) ?? 0
      return {
        id: String(show.id),
        date: new Date(show.date as string).toISOString().slice(0, 10),
        time: show.time as string,
        venue,
        remaining: remainingSeats({
          capacity,
          activeTicketCount: sold,
          inPersonSold: (show.inPersonSold as number) ?? 0,
          legacyReserved: (show.legacyReserved as number) ?? 0,
        }),
      }
    })
    // Drop shows that started more than the grace window ago (Europe/Zagreb).
    .filter((s) => !isPastShowCutoff(s.date, s.time))

  return limit != null ? shows.slice(0, limit) : shows
}
