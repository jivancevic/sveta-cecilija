import { getPayload } from 'payload'
import config from '@payload-config'

export interface Show {
  id: string;
  date: string;      // YYYY-MM-DD
  time: string;
  capacity: number;
  remaining: number; // capacity - onlineSold - inPersonSold
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

  return result.docs.map((show) => ({
    id: String(show.id),
    date: new Date(show.date as string).toISOString().slice(0, 10),
    time: show.time as string,
    capacity: show.capacity as number,
    remaining:
      (show.capacity as number) -
      ((show.onlineSold as number) ?? 0) -
      ((show.inPersonSold as number) ?? 0),
  }))
}
