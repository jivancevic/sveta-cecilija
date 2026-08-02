// Update access for the Users collection, as a pure predicate (ADR-0022).
//
// Historically this was an inline `selfOrSuperadmin` on both read and update.
// Update needs one more rule than read does: the `member` role is a SHARED
// account for the whole society membership, so "edit your own record" is not the
// harmless self-service it is for a real person — any one member could rotate
// the shared password and lock out everyone else, the developer included.
// Password rotation for that account is a superadmin act.
//
// Extracted here so the rule is unit-tested rather than buried in a collection
// config, and so a future shared account inherits the same reasoning.

import { isSuperadmin, isMember } from './roles'

type ReqUser = { id?: string | number; role?: string } | null | undefined

/** Payload access return: `true` = all, `false` = none, or a Where constraint. */
export type UserUpdateAccess = boolean | { id: { equals: string | number } }

export function userUpdateAccess(user: ReqUser): UserUpdateAccess {
  if (isSuperadmin(user)) return true
  // Shared, read-only society login: no self-edit at all (ADR-0022).
  if (isMember(user)) return false
  if (!user?.id) return false
  return { id: { equals: user.id } }
}
