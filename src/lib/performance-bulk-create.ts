// Creating a batch of performances as ONE announcement (#441 review, #438).
//
// `/api/shows/bulk-create` writes a whole season of Redovna dates in a loop and
// the MCP `create_performances` tool writes next year's cruise calls the same
// way. Both need the same three facts to stay true, so they live here rather
// than in either caller:
//
//  1. **Every create carries `context.skipRosterPush`.** The Shows `afterChange`
//     hook honours it and stays quiet, because twenty-two "nova izvedba"
//     notifications for one paste is not a notification, it is a punishment.
//  2. **The batch is ONE transaction** (#445 review). The rows are validated
//     all-or-nothing before anything is written, and the writes have to match
//     that promise: without a transaction, a create that throws on row nine
//     leaves eight evenings in the roster that the caller was told did not
//     happen — and the MCP tool answers with a `created` list that is then a
//     lie. The transaction is the same `beginTransaction` / `commitTransaction`
//     the lineup writer uses (`lineup/write-tx.ts`), threaded through as a
//     `req: { transactionID }` so the local API joins it.
//  3. **One summary push goes out after the loop**, pointing at the list rather
//     than at any one evening, DETACHED, and unable to fail the request: the
//     rows are already committed, and a caller must never see an error because
//     a push service is down.
//
// The core is pure over injected functions, so the ordering, the transaction
// boundary and the "one announcement" rule are unit-testable without Payload;
// `payloadBulkDeps` is the one wiring, shared by both callers so the detached
// push closure exists once.

import { createPushDeps, type PushPayload } from '@/lib/push/push-data'
import { notifyBulkCreated } from '@/lib/push/notify'
import { SKIP_ROSTER_PUSH } from '@/lib/push/shows-hook'

/** One row to write: the data Payload stores, plus the `YYYY-MM-DD` it is for. */
export interface BulkPerformanceRow {
  dateStr: string
  data: Record<string, unknown>
}

export interface BulkCreateDeps<Tx = unknown> {
  /**
   * Run `fn` inside one transaction. An adapter without transactions hands back
   * `undefined` and the writes simply run unwrapped, which is what the fake in
   * the unit tests does too.
   */
  withTransaction: <T>(fn: (tx: Tx | undefined) => Promise<T>) => Promise<T>
  /** `payload.create({ collection: 'shows', … })`, joined to the transaction. */
  create: (
    args: { data: Record<string, unknown>; context: Record<string, unknown> },
    tx: Tx | undefined,
  ) => Promise<unknown>
  /**
   * The single summary push. Called once, only after the transaction committed
   * and only when something was created; it detaches its own send.
   */
  announce?: (input: { count: number; firstDate: string }) => void
}

export interface BulkCreateResult {
  /** The `YYYY-MM-DD` of every row that was written, in order. */
  created: string[]
}

/**
 * Write the rows in order inside one transaction, then announce once.
 *
 * A `create` that throws aborts and rolls back the whole batch, and the error
 * reaches the caller: the admin route turns it into a 500 and the MCP tool into
 * a refusal, and in both cases nothing was written.
 */
export async function createPerformancesInBulk<Tx>(
  rows: readonly BulkPerformanceRow[],
  deps: BulkCreateDeps<Tx>,
): Promise<BulkCreateResult> {
  const created = await deps.withTransaction(async (tx) => {
    const written: string[] = []
    for (const row of rows) {
      await deps.create({ data: row.data, context: { [SKIP_ROSTER_PUSH]: true } }, tx)
      written.push(row.dateStr)
    }
    return written
  })

  // After the commit, never inside it: a push that held the transaction open
  // for a round trip to FCM per phone is the mistake #441 already made once.
  if (created.length > 0 && deps.announce) {
    deps.announce({ count: created.length, firstDate: created[0]! })
  }

  return { created }
}

/** The slice of `getPayload()` the wiring below uses. */
export interface BulkCreatePayload {
  db: {
    beginTransaction: () => Promise<string | null>
    commitTransaction: (id: string) => Promise<void>
    rollbackTransaction: (id: string) => Promise<void>
  }
  create: (args: Record<string, unknown>) => Promise<unknown>
}

/**
 * The Payload wiring, shared by `/api/shows/bulk-create` and the MCP store.
 *
 * It exists so the detached-announce closure is written once: two copies of
 * "build the push deps, fire and forget, log the failure" is two places for the
 * `void`/`catch` pair to be forgotten.
 */
export function payloadBulkDeps(
  payload: BulkCreatePayload,
  user?: unknown,
): BulkCreateDeps<string | null> {
  return {
    withTransaction: async (fn) => {
      const tx = await payload.db.beginTransaction()
      if (!tx) return fn(undefined)
      try {
        const result = await fn(tx)
        await payload.db.commitTransaction(tx)
        return result
      } catch (err) {
        await payload.db.rollbackTransaction(tx).catch(() => {})
        throw err
      }
    },

    create: (args, tx) =>
      payload.create({
        collection: 'shows',
        overrideAccess: true,
        user,
        ...args,
        ...(tx ? { req: { transactionID: tx } } : {}),
      }),

    announce: (input) => {
      const push = createPushDeps(payload as unknown as PushPayload)
      void notifyBulkCreated(input, push).catch((err) =>
        console.error('[push] bulk create notification failed', err),
      )
    },
  }
}
