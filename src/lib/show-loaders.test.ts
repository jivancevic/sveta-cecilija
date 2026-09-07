import { describe, expect, it } from 'vitest'
import { loadNextShow, loadUpcomingShows, type ShowsFindArgs } from './show-loaders'

// A minimal in-memory stand-in for `payload.find({ collection: 'shows' })`.
// It genuinely EVALUATES the `where` it is handed, so a loader that forgets the
// public-performance predicate hands back the non-public rows and the test
// fails on behaviour (which rows come back), not on how the Where is spelled.
type Row = Record<string, unknown>

function matches(row: Row, where: Record<string, unknown>): boolean {
  if (Array.isArray(where.and)) {
    return (where.and as Record<string, unknown>[]).every((w) => matches(row, w))
  }
  return Object.entries(where).every(([field, cond]) => {
    const c = cond as Record<string, unknown>
    const value = row[field]
    if ('equals' in c) return value === c.equals
    if ('greater_than_equal' in c) {
      return new Date(String(value)).getTime() >= new Date(String(c.greater_than_equal)).getTime()
    }
    throw new Error(`fake find: unsupported operator in ${JSON.stringify(c)}`)
  })
}

function fakeFind(rows: Row[]) {
  return async (args: ShowsFindArgs) => {
    const docs = rows
      .filter((r) => matches(r, (args.where ?? {}) as Record<string, unknown>))
      .sort((a, b) => new Date(String(a.date)).getTime() - new Date(String(b.date)).getTime())
      .slice(0, args.limit ?? rows.length)
    return { docs }
  }
}

const FUTURE = '2099-08-10T12:00:00.000Z'
const LATER = '2099-08-11T12:00:00.000Z'

const publicShow: Row = {
  id: 1,
  date: FUTURE,
  time: '21:00',
  venue: 'ljetno-kino',
  status: 'active',
  isPublic: true,
  kind: 'redovna',
  inPersonSold: 0,
  legacyReserved: 0,
}

const nonPublicPerformance: Row = {
  id: 2,
  // Earlier in the day AND earlier in the list — it would win "next show" if the
  // predicate were missing.
  date: '2099-08-09T12:00:00.000Z',
  time: '10:00',
  venue: null,
  status: 'active',
  isPublic: false,
  kind: 'gulliver',
  location: 'Zimsko kino',
  client: 'Le Ponant',
  inPersonSold: 0,
  legacyReserved: 0,
}

describe('loadUpcomingShows', () => {
  it('returns public performances only from a mixed set', async () => {
    const shows = await loadUpcomingShows({
      find: fakeFind([nonPublicPerformance, publicShow]),
      soldByShow: async () => new Map(),
      now: () => new Date('2099-08-01T00:00:00.000Z'),
    })
    expect(shows.map((s) => s.id)).toEqual(['1'])
  })

  it('derives remaining from the venue capacity and the sold counts', async () => {
    const shows = await loadUpcomingShows({
      find: fakeFind([{ ...publicShow, inPersonSold: 10, legacyReserved: 5 }]),
      soldByShow: async () => new Map([['1', 20]]),
      now: () => new Date('2099-08-01T00:00:00.000Z'),
    })
    expect(shows[0]).toMatchObject({
      id: '1',
      date: '2099-08-10',
      time: '21:00',
      venue: 'ljetno-kino',
      remaining: 320 - 20 - 10 - 5,
    })
  })

  it('never consults VENUE_CAPACITY for a non-public (venue NULL) row', async () => {
    const shows = await loadUpcomingShows({
      find: fakeFind([nonPublicPerformance]),
      soldByShow: async () => new Map(),
      now: () => new Date('2099-08-01T00:00:00.000Z'),
    })
    expect(shows).toEqual([])
  })

  it('applies the caller limit after filtering', async () => {
    const shows = await loadUpcomingShows(
      {
        find: fakeFind([nonPublicPerformance, publicShow, { ...publicShow, id: 3, date: LATER }]),
        soldByShow: async () => new Map(),
        now: () => new Date('2099-08-01T00:00:00.000Z'),
      },
      1,
    )
    expect(shows.map((s) => s.id)).toEqual(['1'])
  })

  it('excludes cancelled shows', async () => {
    const shows = await loadUpcomingShows({
      find: fakeFind([{ ...publicShow, status: 'cancelled' }]),
      soldByShow: async () => new Map(),
      now: () => new Date('2099-08-01T00:00:00.000Z'),
    })
    expect(shows).toEqual([])
  })
})

describe('loadNextShow', () => {
  it('skips a non-public performance that falls earlier than the next public show', async () => {
    const next = await loadNextShow({
      find: fakeFind([nonPublicPerformance, publicShow]),
      activeTicketCountForShow: async () => 7,
      now: () => new Date('2099-08-01T00:00:00.000Z'),
    })
    expect(next).toMatchObject({ id: '1', date: '2099-08-10', time: '21:00', venue: 'ljetno-kino', onlineSold: 7 })
  })

  // The door dashboard's "tonight's show" (and therefore its admitted-progress
  // ring, the scan scope and the manual code lookup) is whatever getNextShow
  // returns. A 10:00 cruise-ship call on the SAME day as the evening Redovna is
  // the case that would break it: it sorts first and it is still in the future.
  it("picks the evening Redovna over the same-day 10:00 DMC call", async () => {
    const dmcCall: Row = {
      ...nonPublicPerformance,
      id: 5,
      date: FUTURE, // same calendar day as publicShow
      time: '10:00',
      kind: 'dmc',
      client: 'Adriatic DMC',
    }
    const next = await loadNextShow({
      find: fakeFind([dmcCall, publicShow]),
      activeTicketCountForShow: async () => 0,
      now: () => new Date('2099-08-10T06:00:00.000Z'),
    })
    expect(next).toMatchObject({ id: '1', time: '21:00', venue: 'ljetno-kino' })
  })

  it('returns null when only non-public performances remain', async () => {
    const next = await loadNextShow({
      find: fakeFind([nonPublicPerformance]),
      activeTicketCountForShow: async () => 0,
      now: () => new Date('2099-08-01T00:00:00.000Z'),
    })
    expect(next).toBeNull()
  })
})
