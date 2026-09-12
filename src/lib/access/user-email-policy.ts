// Email requirement policy for the Users collection (#175, ADR-0010, ADR-0023).
//
// With hybrid username login (`loginWithUsername`, `requireEmail: false`) every
// user has a canonical `username`; email is optional at the auth layer. But an
// account belonging to a real person should still carry an email — it is the
// password-reset / contact channel. Since #395 "a real person" is read off the
// permission set rather than the role: holders of `users`, `tickets` or
// `moreska` are named individuals (the developer, the secretaries, the
// voditelj). Shared and external accounts — the door login, a partner POS, the
// society-wide season dashboard — have no inbox, so email stays optional.
//
// **A `moreskant` was on that list from #420 until #463 and is not any more.**
// It was there because the invitation that creates the login was itself an
// email; since #463 an invitation is a LINK, which a voditelj hands over by SMS
// or a dancer claims from the rehearsal QR, and neither needs an inbox. The
// requirement was not protecting anything: it was refusing a login to
// seventy-five of the seventy-six moreškanti on the roster, who have no address
// on file and who reach the society by phone. A dancer with an address still
// gets the letter (ADR-0024, `docs/agents/moreskant-app.md`).
//
// Pure + DI so the rule is unit-tested without Payload; a Users beforeValidate
// hook wires it to the merged document.

import { hasAny, permissionsOf, type Permission, type PermissionUser } from './permissions'

/** Permissions only a named individual ever holds. */
export const EMAIL_REQUIRED_PERMISSIONS: readonly Permission[] = ['users', 'tickets', 'moreska']

/** True when this permission set belongs to a real person, who must have an email. */
export function emailRequiredFor(user: PermissionUser): boolean {
  return hasAny(user, EMAIL_REQUIRED_PERMISSIONS)
}

export class UserEmailRequiredError extends Error {
  constructor(permissions: readonly string[]) {
    super(`An email address is required for accounts with ${permissions.join(', ')}`)
    this.name = 'UserEmailRequiredError'
  }
}

/**
 * Throws UserEmailRequiredError if a person-tier account has no email. `email`
 * is trimmed-checked so whitespace-only doesn't satisfy the requirement. No-ops
 * for door/partner/season_stats accounts (email optional) and for an empty set.
 */
export function assertUserEmailPolicy(doc: {
  permissions?: unknown
  email?: string | null
}): void {
  if (!emailRequiredFor(doc)) return
  if (doc.email?.trim()) return
  throw new UserEmailRequiredError(
    permissionsOf(doc).filter((p) => EMAIL_REQUIRED_PERMISSIONS.includes(p)),
  )
}
