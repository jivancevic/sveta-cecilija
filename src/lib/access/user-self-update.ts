// Update access for the Users collection (ADR-0022, ADR-0023).
//
// Historically this was an inline `selfOrSuperadmin` on both read and update.
// Update needs one more rule than read does: some logins are SHARED by several
// people (the door `tehnika` account, the society-wide `member` account), so
// "edit your own record" is not the harmless self-service it is for a real
// person — any one holder could rotate the shared password and lock out
// everyone else, the developer included. Rotation is a `users`-holder act.
//
// Since #395 the rule reads the permission set and the `shared` checkbox
// instead of the role: `shared` is now the ONLY place the shared-account fact
// lives, so marking a new shared login needs no code change.
//
// Extracted here so the rule is unit-tested rather than buried in a collection
// config.

import { can, type PermissionUser } from './permissions'

type ReqUser = (PermissionUser & { id?: string | number; shared?: unknown }) | null | undefined

/** Payload access return: `true` = all, `false` = none, or a Where constraint. */
export type UserUpdateAccess = boolean | { id: { equals: string | number } }

export function userUpdateAccess(user: ReqUser): UserUpdateAccess {
  // The `users` holder administers every account, their own included.
  if (can(user, 'users')) return true
  // A shared login gets no self-edit at all (ADR-0022).
  if (user?.shared === true) return false
  if (!user?.id) return false
  return { id: { equals: user.id } }
}
