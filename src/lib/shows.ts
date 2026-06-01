import { getPayload } from 'payload'
import config from '@payload-config'
import { VENUE_CAPACITY, type Venue } from './venues'
import { getActiveTicketCountsByShow, getActiveTicketCountForShow } from './tickets/sold-seats'

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
  const numericId = Number(showId)
  if (!Number.isFinite(numericId)) return 0
  const res = await pool.query(
    `SELECT COUNT(*)::int AS people
     FROM tickets t
     JOIN orders o ON o.id = t.order_id
     WHERE o.show_id = $1 AND t.scanned = true AND t.status = 'active'`,
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

  // Sold seats come from active ticket rows, not the retired online_sold column.
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const soldByShow = await getActiveTicketCountsByShow((sql, params) => pool.query(sql, params))

  return result.docs.map((show) => {
    const venue = (show.venue as Venue) ?? 'ljetno-kino'
    const capacity = VENUE_CAPACITY[venue]
    const sold = soldByShow.get(String(show.id)) ?? 0
    return {
      id: String(show.id),
      date: new Date(show.date as string).toISOString().slice(0, 10),
      time: show.time as string,
      venue,
      remaining:
        capacity -
        sold -
        ((show.inPersonSold as number) ?? 0) -
        ((show.legacyReserved as number) ?? 0),
    }
  })
}
