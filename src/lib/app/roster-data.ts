import { getPayload } from 'payload'
import config from '@payload-config'
import { loadSeasonPerformances, type SeasonPerformances } from './roster-loaders'

// The IO wiring behind `/app`'s season list (#421) — the `stats-data.ts` shape:
// this file holds the Payload call and nothing else, so every rule about WHICH
// performances a dancer sees and how they are split stays in the pure,
// unit-tested `roster-loaders.ts`.
//
// The local API runs with `overrideAccess: true`, so the collection access on
// Shows does not scope this read. That is deliberate: roster visibility is
// society-wide, and the caller has already established through the `/app`
// access decision that the viewer is a moreškant or a voditelj.

export async function getSeasonPerformances(
  viewer: { memberId?: string | null; voditelj?: boolean } = {},
): Promise<SeasonPerformances> {
  const payload = await getPayload({ config })
  return loadSeasonPerformances({
    find: (args) =>
      payload.find(args as Parameters<typeof payload.find>[0]) as Promise<{
        docs: Record<string, unknown>[]
      }>,
    memberId: viewer.memberId ?? null,
    voditelj: viewer.voditelj === true,
  })
}
