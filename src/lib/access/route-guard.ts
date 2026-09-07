import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { type RoleUser } from './roles'
import { can, hasAny, type Permission, type PermissionUser } from './permissions'

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

/**
 * The permission-shaped route chokepoint (ADR-0023). Same contract and same
 * return shape as `requireRole` above — 401 without a session, 403 when the
 * check fails, `{ payload, user }` otherwise — but keyed off the permission set
 * instead of the role:
 *
 *   const gate = await requirePermission(req, 'refunds')
 *   if (gate.error) return gate.error
 *   const { payload, user } = gate
 *
 * Pass an array to mean "any of these" (`hasAny`), which is the composed
 * predicate case `requireRole` covered with `u => isAdminTier(u) || isPartner(u)`.
 * An empty array denies, never wildcards. Token/signature routes (Stripe
 * webhook, /scan claim, unsubscribe, cron) stay outside this guard — they have
 * no session user to check.
 *
 * Lands next to `requireRole` in the expand step of #393; the route call sites
 * move over in #396 and `requireRole` goes away in #397.
 */
export async function requirePermission(
  req: Request,
  permission: Permission | Permission[],
): Promise<RouteGuardResult> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) {
    return { payload, user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const allowed = Array.isArray(permission)
    ? hasAny(user as PermissionUser, permission)
    : can(user as PermissionUser, permission)
  if (!allowed) {
    return { payload, user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { payload, user, error: null }
}
