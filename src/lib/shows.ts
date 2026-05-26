import { getPayload } from 'payload'
import config from '@payload-config'
import { VENUE_CAPACITY, type Venue } from './venues'

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

  return {
    id: String(doc.id),
    date: new Date(doc.date as string).toISOString().slice(0, 10),
    time: (doc.time as string) ?? '',
    venue: (doc.venue as Venue) ?? 'ljetno-kino',
    onlineSold: Number(doc.onlineSold ?? 0),
    inPersonSold: Number(doc.inPersonSold ?? 0),
  }
}

/**
 * Sum of people (adult_count + child_count) for orders whose QR token
 * has been scanned for the given show. "People through the door", not
 * token count. Apples-to-apples with onlineSold.
 */
export async function getScannedPeopleForShow(showId: number | string): Promise<number> {
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const numericId = Number(showId)
  if (!Number.isFinite(numericId)) return 0
  const res = await pool.query(
    `SELECT COALESCE(SUM(o.adult_count + o.child_count), 0)::int AS people
     FROM orders o
     JOIN qr_tokens q ON q.order_id = o.id
     WHERE o.show_id = $1 AND q.scanned = true`,
    [numericId],
  )
  return Number(res.rows[0]?.people ?? 0)
}

export async function getUpcomingShows(limit?: number): Promise<Show[]> {
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
    limit: limit ?? 200,
    depth: 0,
  })

  return result.docs.map((show) => {
    const venue = (show.venue as Venue) ?? 'ljetno-kino'
    const capacity = VENUE_CAPACITY[venue]
    return {
      id: String(show.id),
      date: new Date(show.date as string).toISOString().slice(0, 10),
      time: show.time as string,
      venue,
      remaining:
        capacity -
        ((show.onlineSold as number) ?? 0) -
        ((show.inPersonSold as number) ?? 0) -
        ((show.legacyReserved as number) ?? 0),
    }
  })
}
