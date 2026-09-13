// The seam wiring behind the four voditelj routes (#503, #475).
//
// Written once rather than four times, because the three deps are identical on
// every one of them and a route that reached for a different `updatePerformance`
// would be a second writer of the same column.
//
// Everything here goes through `getRepo()`: this file imports no Payload, which
// is what `repo-guard.test.ts` checks for every new file under `src/lib/app/`.

import { permissionsOf } from '@/lib/access/permissions'
import { getRepo } from '@/lib/repo'
import { getActiveTicketCountForShow } from '@/lib/tickets/sold-seats'
import type { PerformanceFormDeps } from './performance-form'

/**
 * The three data deps plus the caller's set; the route adds `request`.
 *
 * `permissions` is read off the SAME user object the writes are attributed to
 * (#502), so "who is writing this" and "who may write this kind of row" can
 * never end up being two different people.
 */
export function performanceFormDeps(actor: unknown): Omit<PerformanceFormDeps, 'request'> {
  const repo = getRepo()
  const shows = repo.shows
  return {
    permissions: permissionsOf(actor as { permissions?: unknown }),
    // The venue lock's one question (#502 review), through the SAME counter the
    // seat model uses everywhere else: one active ticket is one person who
    // would have to be told the room moved.
    activeTickets: (id) => getActiveTicketCountForShow(repo.db.query, id),
    loadPerformance: (id) => shows.performanceById(id),
    createPerformances: (rows) => shows.createPerformances(rows, actor),
    updatePerformance: (id, patch) => shows.updatePerformance(id, patch, actor),
  }
}
