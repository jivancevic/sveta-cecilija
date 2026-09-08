import { getPayload } from 'payload'
import config from '@payload-config'
import { loadPerformanceDetail, type PerformanceDetail } from './detail-loaders'

// The IO wiring behind `/app/izvedba/[id]` (#423) — the `roster-data.ts` shape:
// the Payload calls and nothing else, so every rule about what the detail shows
// stays in the pure, unit-tested `detail-loaders.ts`.
//
// The local API runs with `overrideAccess: true`, so collection access scopes
// none of these reads. That is deliberate and the same decision the season list
// made: roster visibility is society-wide, and the caller has already
// established through the `/app` access decision that the viewer is on the
// roster. The moreškant roster covers EVERY performance of the season, public or
// not (ADR-0024), so the shows read carries no public predicate — the phase 2
// guard test lists this file with that justification.

export async function getPerformanceDetail(
  performanceId: string,
  viewer: { memberId: string | null; voditelj: boolean },
): Promise<PerformanceDetail | null> {
  const payload = await getPayload({ config })

  return loadPerformanceDetail(performanceId, {
    viewer,

    loadPerformance: async (id) => {
      try {
        return (await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as Record<string, unknown>
      } catch {
        // A bad id in the URL is a missing page, not a 500.
        return null
      }
    },

    loadAttendance: async (id) => {
      const result = await payload.find({
        collection: 'attendance',
        where: { performance: { equals: id } },
        limit: 1000,
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
  })
}
