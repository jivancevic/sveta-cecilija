import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { can, hasAny, type Permission, type PermissionUser } from './permissions'

type Payload = Awaited<ReturnType<typeof getPayload>>
type AuthedUser = NonNullable<Awaited<ReturnType<Payload['auth']>>['user']>

export type RouteGuardResult =
  | { payload: Payload; user: AuthedUser; error: null }
  | { payload: Payload; user: null; error: NextResponse }

/**
 * The single route-level authorization chokepoint (ADR-0023).
 *
 * Payload's local API runs with `overrideAccess: true`, so collection `access`
 * does NOT gate mutation routes — every staff route MUST re-check the caller in
 * the handler (CLAUDE.md hard rule). Rather than re-type
 * `getPayload → payload.auth → permission check` per route (which is how two
 * routes once shipped with the check missing), call this:
 *
 *   const gate = await requirePermission(req, 'refunds')
 *   if (gate.error) return gate.error
 *   const { payload, user } = gate   // payload/user reusable, no second auth
 *
 * Returns 401 when unauthenticated, 403 when the caller lacks the permission.
 * Pass an array to mean "any of these" (`hasAny`); an empty array denies and
 * never wildcards. Routes whose auth is token- or signature-based (Stripe
 * webhook, /scan claim, /order/[token]/refund, unsubscribe, cron) are the only
 * sanctioned exceptions — they have no session user to check.
 *
 * Ownership scoping for a `partner` caller is NOT this guard's job: derive it
 * from ./partner (`partnerOwnOrdersWhere` and friends) and pass it as a `where`.
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
