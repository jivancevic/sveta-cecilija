// Ownership scoping for the `partner` role (ADR-0008).
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
// Every helper is a pure function of the authenticated user. When the user is
// not a partner or has no linked record, the Where helpers return `false`
// (Payload reads this as "match nothing"), so the fail-safe is no access.

import { isPartner, partnerIdOf, type RoleUser } from './roles'
import type { Where } from 'payload'

// Orders the partner sold: `orders.partner = <self>`.
export function partnerOwnOrdersWhere(user: RoleUser): Where | false {
  if (!isPartner(user)) return false
  const id = partnerIdOf(user)
  return id == null ? false : { partner: { equals: id } }
}

// The partner's own record: `partners.id = <self>`.
export function partnerOwnRecordWhere(user: RoleUser): Where | false {
  if (!isPartner(user)) return false
  const id = partnerIdOf(user)
  return id == null ? false : { id: { equals: id } }
}

// Tickets under the partner's orders, joined through the order relationship:
// `tickets.order.partner = <self>`.
export function partnerOwnTicketsWhere(user: RoleUser): Where | false {
  if (!isPartner(user)) return false
  const id = partnerIdOf(user)
  return id == null ? false : { 'order.partner': { equals: id } }
}
