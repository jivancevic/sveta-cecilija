import { getPayload } from 'payload'
import config from '@payload-config'
import { VENUE_CAPACITY, type Venue } from './venues'
import {
  getActiveTicketCountsByShow,
  getActiveTicketCountForShow,
  getScannedTicketCountForShow,
} from './tickets/sold-seats'
import {
  loadNextShow,
  loadUpcomingShows,
  type NextShow,
  type Show,
  type ShowsFind,
} from './show-loaders'

export { VENUE_CAPACITY, type Venue }
export type { Show, NextShow }

type PoolQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

/**
 * Next active PUBLIC show with date >= today, ordered by date ASC.
 * Returns null if no future show exists. Tehnika dashboard surface.
 *
 * The row selection (including the public-performance predicate, ADR-0024)
 * lives in `show-loaders.ts`; this is the Payload wiring.
 */
export async function getNextShow(): Promise<NextShow | null> {
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  return loadNextShow({
    find: ((args) => payload.find(args as never)) as ShowsFind,
    activeTicketCountForShow: (showId) =>
      getActiveTicketCountForShow((sql, params) => pool.query(sql, params), showId),
  })
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
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool

  return loadUpcomingShows(
    {
      find: ((args) => payload.find(args as never)) as ShowsFind,
      soldByShow: () => getActiveTicketCountsByShow((sql, params) => pool.query(sql, params)),
    },
    limit,
  )
}
