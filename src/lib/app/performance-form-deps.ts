// The seam wiring behind the four voditelj routes (#503, #475).
//
// Written once rather than four times, because the three deps are identical on
// every one of them and a route that reached for a different `updatePerformance`
// would be a second writer of the same column.
//
// Everything here goes through `getRepo()`: this file imports no Payload, which
// is what `repo-guard.test.ts` checks for every new file under `src/lib/app/`.

import { getRepo } from '@/lib/repo'
import type { PerformanceFormDeps } from './performance-form'

/** The three data deps; the caller adds `request`. */
export function performanceFormDeps(actor: unknown): Omit<PerformanceFormDeps, 'request'> {
  const shows = getRepo().shows
  return {
    loadPerformance: (id) => shows.performanceById(id),
    createPerformances: (rows) => shows.createPerformances(rows, actor),
    updatePerformance: (id, patch) => shows.updatePerformance(id, patch, actor),
  }
}
