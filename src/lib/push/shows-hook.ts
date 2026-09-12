// The Shows `afterChange` hook (#436) — Payload's calling convention and
// nothing else.
//
// It is deliberately the thinnest possible layer: build the deps, hand the two
// documents to `notifyPerformanceSaved`, swallow anything that goes wrong. All
// three of those matter.
//
//   - `afterChange`, not `beforeChange`: a notification about a change that
//     then failed to save would be a lie, and `previousDoc` is only meaningful
//     once the new one is stored.
//   - It runs for EVERY writer of the collection — the admin form, the
//     `/api/app/note` route, a bulk create, a Stripe sale ticking `onlineSold`.
//     That is the point (#430: the `/app` note edit goes through the collection
//     so this hook fires), and it is also why the diff is narrow: a sale
//     changes nothing the diff watches and sends nothing.
//   - Nothing it does may fail the save. `notifyPerformanceSaved` already
//     catches its own errors and DETACHES the fan-out (it runs inside the
//     save's transaction); the try/catch here covers the deps themselves (a
//     Payload instance with no pool, in a script or a test).
//   - One caller opts out: the bulk create sets `skipRosterPush` on the request
//     context, because a season entered in a loop is ONE announcement and not
//     twenty-two (#441 review). The flag is deliberately narrow — a boolean on
//     `req.context`, read here and set in exactly one place.

import type { CollectionAfterChangeHook } from 'payload'
import { createPushDeps, type PushPayload } from './push-data'
import { notifyPerformanceSaved } from './notify'

/** The `req.context` flag a caller sets to write without notifying the roster. */
export const SKIP_ROSTER_PUSH = 'skipRosterPush'

export const notifyRosterOnShowChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
  context,
}) => {
  const ctx = (context ?? (req as { context?: Record<string, unknown> }).context) as
    | Record<string, unknown>
    | undefined
  if (ctx?.[SKIP_ROSTER_PUSH] === true) return doc

  try {
    const deps = createPushDeps(req.payload as unknown as PushPayload)
    await notifyPerformanceSaved(
      {
        doc: doc as Record<string, unknown>,
        previousDoc: (previousDoc ?? null) as Record<string, unknown> | null,
        operation: operation === 'create' ? 'create' : 'update',
      },
      deps,
    )
  } catch (err) {
    console.error('[push] show change hook failed', err)
  }
  return doc
}
