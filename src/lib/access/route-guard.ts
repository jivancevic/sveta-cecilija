import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { type RoleUser } from './roles'

type Payload = Awaited<ReturnType<typeof getPayload>>
type AuthedUser = NonNullable<Awaited<ReturnType<Payload['auth']>>['user']>

export type RouteGuardResult =
  | { payload: Payload; user: AuthedUser; error: null }
  | { payload: Payload; user: null; error: NextResponse }

/**
 * The single route-level authorization chokepoint.
 *
 * Payload's local API runs with `overrideAccess: true`, so collection `access`
 * does NOT gate mutation routes — every admin/staff route MUST re-check the role
 * in the handler (CLAUDE.md hard rule). Rather than re-type
 * `getPayload → payload.auth → role check` per route (which is how two routes
 * shipped with the role check missing), call this:
 *
 *   const gate = await requireRole(req, isAdminTier)
 *   if (gate.error) return gate.error
 *   const { payload, user } = gate   // payload/user reusable, no second auth
 *
 * `predicate` is any role check from ./roles (isAdminTier, isAuthed, isPartner,
 * or a composed `u => isAdminTier(u) || isPartner(u)`). Returns 401 when
 * unauthenticated, 403 when the predicate fails. Routes whose auth is token- or
 * signature-based (Stripe webhook, /scan claim, unsubscribe, cron) do not use
 * this — they have no session user to check.
 */
export async function requireRole(
  req: Request,
  predicate: (user: RoleUser) => boolean,
): Promise<RouteGuardResult> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) {
    return { payload, user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!predicate(user as RoleUser)) {
    return { payload, user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { payload, user, error: null }
}
