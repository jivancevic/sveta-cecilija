// Ownership scoping for the `partner` permission (ADR-0008, ADR-0023).
//
// A partner login is bound to exactly one `partners` record (via the `partner`
// relationship on Users) and may only ever see *its own* data: its partner
// record, the orders it sold, and the tickets under those orders. These helpers
// are the single source of that scoping, shared by:
//   - collection-level `access.read` (Payload enforces the returned Where), and
//   - route handlers that call Payload's local API with overrideAccess:true,
//     where collection access does NOT run — so any partner-facing route MUST
//     re-derive the scope here and pass it as a `where`, never trust the caller.
//
// Every helper is a pure function of the authenticated user. When the user does
// not hold `partner` or has no linked record, the Where helpers return `false`
// (Payload reads this as "match nothing"), so the fail-safe is no access. That
// covers the `users` holder too: it holds every permission including `partner`
// but carries no Partners link, so it scopes to nothing here and reaches partner
// data through the `tickets` branch of the caller instead.

import { can, type PermissionUser } from './permissions'
import type { Where } from 'payload'

/** A `req.user` carrying both the permission set and the Partners link. */
export type PartnerUser = (PermissionUser & { partner?: unknown }) | null | undefined

// The `partners` record a `partner` login is bound to. The link is the
// `partner` relationship on the Users collection; Payload returns it on
// `req.user` as a bare id (depth 0) or a populated doc. Returns undefined when
// unset (a misconfigured partner login with no linked record) — callers MUST
// treat that as "owns nothing", never as "owns everything".
export function partnerIdOf(user: PartnerUser): number | string | undefined {
  const link = (user as { partner?: unknown } | null | undefined)?.partner
  if (link == null) return undefined
  if (typeof link === 'object') {
    const id = (link as { id?: number | string }).id
    return id == null ? undefined : id
  }
  return link as number | string
}

// Orders the partner sold: `orders.partner = <self>`.
export function partnerOwnOrdersWhere(user: PartnerUser): Where | false {
  if (!can(user, 'partner')) return false
  const id = partnerIdOf(user)
  return id == null ? false : { partner: { equals: id } }
}

// The partner's own record: `partners.id = <self>`.
export function partnerOwnRecordWhere(user: PartnerUser): Where | false {
  if (!can(user, 'partner')) return false
  const id = partnerIdOf(user)
  return id == null ? false : { id: { equals: id } }
}

// Tickets under the partner's orders, joined through the order relationship:
// `tickets.order.partner = <self>`.
export function partnerOwnTicketsWhere(user: PartnerUser): Where | false {
  if (!can(user, 'partner')) return false
  const id = partnerIdOf(user)
  return id == null ? false : { 'order.partner': { equals: id } }
}

/**
 * True when the caller should be treated as a reseller rather than as staff.
 *
 * The `users` holder holds `partner` alongside `tickets`, so a bare
 * `can(user, 'partner')` would flip a superadmin into the partner branch of the
 * routes that serve both (reconciliation, storno, storno/undo) — which is NOT
 * how the role model behaved. Staff wins: holding `tickets` means "acts as
 * staff", everything else with `partner` acts as a reseller.
 */
export function actsAsPartner(user: PartnerUser): boolean {
  return can(user, 'partner') && !can(user, 'tickets')
}
