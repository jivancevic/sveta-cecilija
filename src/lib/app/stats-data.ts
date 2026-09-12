import { getPayload } from 'payload'
import config from '@payload-config'
import { loadSeasonStats, seasonOfDate, type SeasonStats } from './stats-loaders'

// The IO wiring behind `/app/statistika` (#437) — the `detail-data.ts` shape:
// the Payload calls and nothing else, so every rule about what the scoreboard
// counts stays in the pure, unit-tested `stats-loaders.ts` and
// `lib/lineup/stats.ts`.
//
// The local API runs with `overrideAccess: true`, so collection access scopes
// none of these reads; the caller has already established through the `/app`
// access decision that the viewer is on the roster, and the table is
// society-wide by decision (story 37). The season covers EVERY performance,
// public or not (ADR-0024), so the shows read carries no public predicate.

export async function getSeasonStats(requested: unknown): Promise<SeasonStats> {
  const payload = await getPayload({ config })

  return loadSeasonStats(requested, {
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
        where: { performance: { in: [...performanceIds] } },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      })
      return result.docs as unknown as Record<string, unknown>[]
    },

    loadMoreskanti: async () => {
      const result = await payload.find({
        collection: 'members',
        where: { and: [{ isMoreskant: { equals: true } }, { active: { not_equals: false } }] },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      return result.docs as unknown as Record<string, unknown>[]
    },

    // The oldest performance decides how far back the dropdown reaches. One
    // row, not a count: the season list is a range, not a set.
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
