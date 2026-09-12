// The route guard for "any account that is inside Cecilija" (#496).
//
// Almost every `/api/app` route is about ONE thing a permission names — an
// attendance answer is `moreskant | moreska`, the voditelj note is `moreska` —
// so `requirePermission` (`src/lib/access/route-guard.ts`) is the chokepoint and
// stays it. The inbox is the exception: a notification is addressed to an
// ACCOUNT, so the question its two routes ask is exactly the question the page
// gate asks, "does this permission set unlock at least one screen"
// (`src/lib/app/access.ts`).
//
// Spelling that as `requirePermission(req, [...every screen-unlocking word])`
// would re-type the vocabulary CLAUDE.md forbids re-typing, and would drift the
// first time a screen's `unlockedBy` changed. So this guard composes the same
// two pieces the gate does — Payload's `auth`, then `decideAppAccess` through
// the shared `resolveAppAccessFor` — and hands back the account and the pool.
//
// It is still an in-handler re-check, which is the rule it has to satisfy: the
// local API runs `overrideAccess: true`, so nothing else gates these routes.
// 401 for no session, 403 for a signed-in account Cecilija does not admit.

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { PoolQuery } from '@/lib/db/pool-query'
import { poolQuery } from './notifications-store'
import { resolveAppAccessFor, type ViewerPayload } from './viewer'

type Payload = Awaited<ReturnType<typeof getPayload>>
type AuthedUser = NonNullable<Awaited<ReturnType<Payload['auth']>>['user']>

export type AppSessionResult =
  | { payload: Payload; user: AuthedUser; userId: string; query: PoolQuery; error: null }
  | { payload: Payload; user: null; userId: null; query: null; error: NextResponse }

/**
 * Authenticate the caller and check they are admitted to Cecilija at all.
 *
 * The pool comes back with them, because every caller of this guard reads or
 * writes a raw table and obtaining it twice is how two different pools end up
 * in one request.
 */
export async function requireAppSession(req: Request): Promise<AppSessionResult> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })

  if (!user) {
    return {
      payload,
      user: null,
      userId: null,
      query: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { access } = await resolveAppAccessFor(payload as unknown as ViewerPayload, user)
  if (access.kind !== 'ok') {
    return {
      payload,
      user: null,
      userId: null,
      query: null,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { payload, user, userId: String(user.id), query: poolQuery(payload), error: null }
}
