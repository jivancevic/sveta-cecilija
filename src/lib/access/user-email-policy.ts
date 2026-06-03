// Email requirement policy for the Users collection (#175, ADR-0010).
//
// With hybrid username login (`loginWithUsername`, `requireEmail: false`) every
// user has a canonical `username`; email is optional at the auth layer. But the
// human tiers (`superadmin`, `admin`) should still carry an email — it's the
// future password-reset / contact channel for the real people. The shared door
// account (`tehnika`) and external `partner` logins have no inbox, so email
// stays optional for them.
//
// Pure + DI so the rule is unit-tested without Payload; a Users beforeValidate
// hook wires it to the merged document.

const HUMAN_TIERS = new Set(['superadmin', 'admin'])

/** Tiers that represent a real person and therefore must have an email. */
export function emailRequiredForRole(role: string | null | undefined): boolean {
  return !!role && HUMAN_TIERS.has(role)
}

export class UserEmailRequiredError extends Error {
  constructor(role: string) {
    super(`An email address is required for ${role} users`)
    this.name = 'UserEmailRequiredError'
  }
}

/**
 * Throws UserEmailRequiredError if a human-tier user has no email. `email` is
 * trimmed-checked so whitespace-only doesn't satisfy the requirement. No-ops
 * for tehnika/partner (email optional) and for any falsy role.
 */
export function assertUserEmailPolicy(doc: { role?: string | null; email?: string | null }): void {
  if (emailRequiredForRole(doc.role) && !doc.email?.trim()) {
    throw new UserEmailRequiredError(doc.role as string)
  }
}
