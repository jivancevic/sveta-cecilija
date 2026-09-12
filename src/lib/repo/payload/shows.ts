// The Payload-backed `ShowsRepo` (#475).
//
// One id-addressed read, order-joined by every caller: the id arrives off a
// ticket's order, so a non-public performance — which sells nothing and so owns
// no ticket — cannot surface. The schedule is read through `src/lib/shows.ts`,
// not here.

import { PUBLIC_PERFORMANCE_WHERE } from '@/lib/show-performance'
import type { ShowsRepo, TicketedPerformance } from '../shows'
import { payloadClient, type PayloadClient } from './client'

/** The `dayOnly` column comes back as a Date; the app passes days as strings. */
function dayOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? '').slice(0, 10)
}

export function createShowsRepo(load: () => Promise<PayloadClient> = payloadClient): ShowsRepo {
  return {
    async detailsById(id) {
      const payload = await load()
      try {
        const doc = await payload.findByID({ collection: 'shows', id, depth: 0 })
        return {
          // A `dayOnly` column comes back as a Date from the adapter; the whole
          // app passes the day around as `YYYY-MM-DD`.
          date: new Date(doc.date as string).toISOString().slice(0, 10),
          time: doc.time as string,
          venue: doc.venue as string,
        }
      } catch {
        return null
      }
    },

    async ticketedPerformances(): Promise<TicketedPerformance[]> {
      const payload = await load()
      const found = await payload.find({
        collection: 'shows',
        where: PUBLIC_PERFORMANCE_WHERE,
        sort: '-date',
        depth: 0,
        // The whole ticketed history: a season is 22 evenings, so this is a
        // short list and a filter that could not reach last August would be
        // useless the week after a season ends.
        limit: 500,
        overrideAccess: true,
      })
      return found.docs.map((doc) => ({
        id: String(doc.id),
        date: dayOf(doc.date),
        time: typeof doc.time === 'string' ? doc.time : '',
        venue: typeof doc.venue === 'string' ? doc.venue : '',
      }))
    },
  }
}
