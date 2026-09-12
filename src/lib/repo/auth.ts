// The auth half of the seam (#475, ADR-0027, seam research section 2).
//
// Phase A answers one question through here — "who is asking" — because that is
// the question every Cecilija screen asks and the one `requirePermission` and
// `resolveAppViewer` re-type today. The login operations (`login`, `logout`,
// `issueResetToken`, `resetPassword`) are named in the research but stay out of
// the interface until a ticket actually moves them: an interface with four
// members nobody calls is four members nobody can change.
//
// What comes back is the `PermissionUser` shape `can()` reads, plus the two
// links the app's access decision needs. Never a Payload document.

import type { Permission } from '@/lib/access/permissions'

/**
 * The caller behind a request: what `can()` reads, and nothing else.
 *
 * `permissions` is a real array rather than `unknown`, so this is structurally
 * a `PermissionUser` and `can(user, 'door')` takes it without a cast.
 */
export interface SessionUser {
  id: string | number
  permissions: Permission[]
  /** `Users.member` — the dancer this login belongs to, or null. */
  memberId: string | null
  /** `Users.partner` — the reseller this login belongs to, or null. */
  partnerId: string | null
  username: string | null
  email: string | null
}

export interface AuthRepo {
  /** The caller behind a request, or null when there is no session. */
  userFromHeaders(headers: Headers): Promise<SessionUser | null>
}
