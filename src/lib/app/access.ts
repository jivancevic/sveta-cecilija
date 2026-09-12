// Who gets into `/app`, and as what (#421, ADR-0023 + ADR-0024).
//
// Cecilija has exactly two audiences and one door:
//   - **voditelj** — a holder of `moreska`. Sees the whole season. A voditelj
//     who also dances carries `self`, their own Member, so they answer for
//     themselves without a second login (#419, story 14). A voditelj who does
//     not dance has no Member link at all and is still perfectly valid (story 15).
//   - **moreškant** — a holder of `moreskant` whose linked Member exists, is
//     active and is flagged as a dancer. Access follows the ROSTER, not the
//     login table: untick `active` or `isMoreskant` and the account is out on
//     its next request, with its history intact (story 16).
// Everyone else — `tickets`, `door`, `partner`, `season_stats`, a `moreskant`
// whose link is missing or stale — is denied and sees the Croatian
// "nemate pristup" page (story 37/38).
//
// A pure function of (user, member) so every bundle × member state is
// table-tested without Payload. The caller resolves the Member (the link is
// field-locked to `users`, so `/app` re-reads it with `overrideAccess`) and
// handles the anonymous case: no session at all is a redirect to `/app/login`,
// not a denial page.

import { can, type PermissionUser } from '@/lib/access/permissions'
import { isMoreskantRow } from '@/lib/moreskant-profile'

/** The Member fields the decision and the app chrome need. Never an email. */
export interface AppMember {
  id: string
  name?: string | null
  nickname?: string | null
  mobile?: string | null
  roles?: string[]
  primaryRole?: string | null
  active?: boolean | null
  isMoreskant?: boolean | null
}

export type AppAccess =
  | { kind: 'voditelj'; self: AppMember | null }
  | { kind: 'moreskant'; member: AppMember }
  | { kind: 'denied' }

/**
 * True when a Member row may be used as a dancer identity: it exists, it is
 * active, and a voditelj has flagged it `isMoreskant`. `active` defaults to
 * true in the collection, so only an explicit `false` retires a dancer.
 */
export function isActiveMoreskant(member: AppMember | null | undefined): member is AppMember {
  if (!member) return false
  if (member.active === false) return false
  return isMoreskantRow(member as unknown as Record<string, unknown>)
}

/**
 * THE `/app` access decision. `member` is the Member `user.member` points at,
 * already loaded, or null when the login carries no link.
 */
export function decideAppAccess(
  user: PermissionUser,
  member: AppMember | null | undefined,
): AppAccess {
  if (!user) return { kind: 'denied' }

  if (can(user, 'moreska')) {
    // A voditelj is in regardless of the Member link. `self` is their own
    // dancer row, set only when they also hold `moreskant` and that row is a
    // live moreškant — the same bar a dancer's own login has to clear.
    const self = can(user, 'moreskant') && isActiveMoreskant(member) ? member : null
    return { kind: 'voditelj', self }
  }

  if (can(user, 'moreskant') && isActiveMoreskant(member)) {
    return { kind: 'moreskant', member }
  }

  return { kind: 'denied' }
}

/** The Member whose nickname and roles the app chrome shows, if any. */
export function accessMember(access: AppAccess): AppMember | null {
  if (access.kind === 'voditelj') return access.self
  if (access.kind === 'moreskant') return access.member
  return null
}
