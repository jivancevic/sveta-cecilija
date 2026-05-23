import { getPayload } from 'payload'
import config from '@payload-config'

export type Venue = 'ljetno-kino' | 'zimsko-kino'

export const VENUE_CAPACITY: Record<Venue, number> = {
  'ljetno-kino': 320,
  'zimsko-kino': 250,
}

export interface Show {
  id: string;
  date: string;      // YYYY-MM-DD
  time: string;
  venue: Venue;
  remaining: number; // venue capacity - onlineSold - inPersonSold
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
      remaining: capacity - ((show.onlineSold as number) ?? 0) - ((show.inPersonSold as number) ?? 0),
    }
  })
}
