import { getRepo } from '@/lib/repo'
import type { PerformanceDetail } from './detail-loaders'

// One evening, behind `/app/performances/[id]` (#423), now one line (#502).
//
// The six Payload reads moved into the seam (`src/lib/repo/payload/roster.ts`)
// when Izvedbe was rebuilt; every rule about what the detail shows stays in the
// pure, unit-tested `detail-loaders.ts`, which is where it already was.

export async function getPerformanceDetail(
  performanceId: string,
  viewer: { memberId: string | null; voditelj: boolean },
): Promise<PerformanceDetail | null> {
  return getRepo().roster.performanceDetail(performanceId, viewer)
}
