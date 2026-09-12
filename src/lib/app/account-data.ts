// The Payload half the invitation and the reset share (#424).
//
// `src/lib/app/{invite,forgot}.ts` hold the rules and know nothing about
// Payload; their routes hold the wiring. These two helpers are the parts of
// that wiring both routes need, written once: minting a reset token, and
// reading a Users row into the shape the rules expect.

import type { InviteUser } from './invite'

/** The slice of Payload these helpers use. */
export interface ResetTokenIssuer {
  forgotPassword: (args: {
    collection: 'users'
    data: never
    disableEmail?: boolean
    expiration?: number
  }) => Promise<unknown>
}

/**
 * Payload's `forgotPassword`, email disabled, targeted by username or email.
 *
 * Two things are worth knowing at the call site and are therefore here:
 *
 * 1. **`disableEmail: true` always.** Payload's own letter is English and links
 *    to `/admin/reset`, which no dancer may open. The Croatian mails are ours
 *    (`src/lib/email/send-moreskant-email.ts`).
 * 2. **The expiration is passed per call** and works only because the Users
 *    auth config sets none. The full explanation lives next to that config in
 *    `src/collections/Users.ts`; do not restate it, and do not add one there.
 *
 * Payload types `data` as `{ email }` from the generated types this repo does
 * not commit, while the operation itself reads `username` too (ADR-0011). The
 * cast widens exactly that, rather than claiming a username is an email.
 */
export async function issueAppResetToken(
  payload: ResetTokenIssuer,
  target: { username?: string; email?: string },
  expirationMs: number,
): Promise<string | null> {
  const token = await payload.forgotPassword({
    collection: 'users',
    data: target as never,
    disableEmail: true,
    expiration: expirationMs,
  })
  return typeof token === 'string' ? token : null
}

/**
 * A Users document as the invitation rules read it. Never a spread.
 *
 * `permissions` rides along for ONE rule, `isDancerLogin`: an invitation may
 * not be aimed at an account that is more than a dancer (#462 review). The
 * lookups that feed this run `overrideAccess: true`, so the field lock on
 * `Users.permissions` does not hide it here.
 */
export function toInviteUser(row: Record<string, unknown> | null | undefined): InviteUser | null {
  if (!row || row.id == null) return null
  return {
    id: row.id as string | number,
    username: typeof row.username === 'string' ? row.username : null,
    email: typeof row.email === 'string' ? row.email : null,
    permissions: Array.isArray(row.permissions) ? (row.permissions as unknown[]) : null,
  }
}
