// Creating a batch of performances as ONE announcement (#441 review, #438).
//
// `/api/shows/bulk-create` writes a whole season of Redovna dates in a loop and
// the MCP `create_performances` tool writes next year's cruise calls the same
// way. Both need the same two facts to stay true, so they live here rather than
// in either caller:
//
//  1. **Every create carries `context.skipRosterPush`.** The Shows `afterChange`
//     hook honours it and stays quiet, because twenty-two "nova izvedba"
//     notifications for one paste is not a notification, it is a punishment.
//  2. **One summary push goes out after the loop**, pointing at the list rather
//     than at any one evening — and it is DETACHED and cannot fail the request:
//     the rows are already in the database, and a caller must never see an error
//     because a push service is down.
//
// Pure over the two injected functions, so both the ordering and the "one
// announcement" rule are unit-testable without Payload.

import { SKIP_ROSTER_PUSH } from '@/lib/push/shows-hook'

/** One row to write: the data Payload stores, plus the `YYYY-MM-DD` it is for. */
export interface BulkPerformanceRow {
  dateStr: string
  data: Record<string, unknown>
}

export interface BulkCreateDeps {
  /** `payload.create({ collection: 'shows', … })`, wired by the caller. */
  create: (args: { data: Record<string, unknown>; context: Record<string, unknown> }) => Promise<unknown>
  /**
   * The single summary push. Called once, only when something was created, and
   * never awaited by this module — the caller decides whether to detach it.
   */
  announce?: (input: { count: number; firstDate: string }) => void
}

export interface BulkCreateResult {
  /** The `YYYY-MM-DD` of every row that was written, in order. */
  created: string[]
}

/**
 * Write the rows in order, each with the roster-push flag, then announce once.
 *
 * Failures are the caller's to handle: a `create` that throws aborts the batch,
 * which is what the admin route already did and what a tool reporting "these
 * three were written, the fourth was refused" needs the exception for.
 */
export async function createPerformancesInBulk(
  rows: readonly BulkPerformanceRow[],
  deps: BulkCreateDeps,
): Promise<BulkCreateResult> {
  const created: string[] = []
  for (const row of rows) {
    await deps.create({ data: row.data, context: { [SKIP_ROSTER_PUSH]: true } })
    created.push(row.dateStr)
  }

  if (created.length > 0 && deps.announce) {
    deps.announce({ count: created.length, firstDate: created[0]! })
  }

  return { created }
}
