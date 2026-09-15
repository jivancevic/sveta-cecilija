import { getRepo } from '@/lib/repo'
import type { SeasonPerformances } from './roster-loaders'

// The season list behind `/app/performances` (#421), now one line (#502).
//
// The Payload calls moved into the seam (`src/lib/repo/payload/roster.ts`) when
// Izvedbe was rebuilt for the blagajna; the rules about WHICH performances a
// dancer sees and how they are split never moved and never should — they are in
// the pure, unit-tested `roster-loaders.ts`. What is left here is the name the
// three pages already call.

export async function getSeasonPerformances(
  viewer: {
    memberId?: string | null
    voditelj?: boolean
    armyCounts?: boolean
    lineupCounts?: boolean
  } = {},
): Promise<SeasonPerformances> {
  return getRepo().roster.seasonPerformances(viewer)
}
