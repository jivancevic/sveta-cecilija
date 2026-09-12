// The Payload-backed `ShowsRepo` (#475).
//
// One id-addressed read, order-joined by every caller: the id arrives off a
// ticket's order, so a non-public performance — which sells nothing and so owns
// no ticket — cannot surface. The schedule is read through `src/lib/shows.ts`,
// not here.

import type { ShowsRepo } from '../shows'
import { payloadClient, type PayloadClient } from './client'

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
  }
}
