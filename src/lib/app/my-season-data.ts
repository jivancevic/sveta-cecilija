import { getPayload } from 'payload'
import config from '@payload-config'
import { loadMySeason, type MySeason } from './my-season-loaders'
import { seasonOfDate } from './stats-loaders'

// The IO wiring behind `/app/leaderboard` (#457) — the `stats-data.ts` shape: the
// Payload calls and nothing else, so every rule about what a dancer's season
// counts stays in the pure, unit-tested `my-season-loaders.ts`.
//
// The local API runs with `overrideAccess: true`, so collection access scopes
// none of these reads; the caller has already established through the `/app`
// access decision that the viewer is on the roster. The lineups query is scoped
// to the viewer's own Member: this page is the one roster surface that is about
// one person, so it reads one person's rows rather than the season's.

export async function getMySeason(
  requested: unknown,
  memberId: string | null,
): Promise<MySeason> {
  const payload = await getPayload({ config })

  return loadMySeason(requested, memberId, {
    loadPerformances: async (season) => {
      const result = await payload.find({
        collection: 'shows',
        where: {
          and: [
            { date: { greater_than_equal: `${season}-01-01T00:00:00.000Z` } },
            { date: { less_than: `${season + 1}-01-01T00:00:00.000Z` } },
          ],
        },
        sort: 'date',
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      return result.docs as unknown as Record<string, unknown>[]
    },

    // ONE query for the whole season, never one per evening.
    loadLineups: async (performanceIds) => {
      const result = await payload.find({
        collection: 'lineups',
        where: {
          and: [
            { performance: { in: [...performanceIds] } },
            ...(memberId ? [{ member: { equals: memberId } }] : []),
          ],
        },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      })
      return result.docs as unknown as Record<string, unknown>[]
    },

    loadFirstSeason: async () => {
      const result = await payload.find({
        collection: 'shows',
        sort: 'date',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const first = result.docs[0] as unknown as Record<string, unknown> | undefined
      return first ? seasonOfDate(first.date) : null
    },
  })
}
