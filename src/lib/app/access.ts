// Who gets into Cecilija, and what they may open (#421, #495; ADR-0023 + ADR-0024).
//
// One rule since the route map (#473): **an account is in when its permission
// set unlocks at least one screen.** There are no audiences any more, only
// permissions and the table they read (`./screens.ts`), so a secretary, a
// partner and a dancer all come through this one door and differ only in what
// it hands back.
//
// Two permissions carry a condition the table cannot see for itself:
//
//   - `moreskant` unlocks nothing unless the linked Member is a live dancer.
//     Access follows the ROSTER, not the login table: untick `active` or
//     `isMoreskant` and the account is out on its next request, with its
//     history intact (#419, story 16).
//   - `partner` unlocks nothing without a Partner link.
//
// "Is there a dancer here" stays a separate question, answered by `self`: a
// voditelj who also dances carries their own Member so they answer for
// themselves without a second login (story 14), and a voditelj who does not
// dance has no Member at all and is perfectly valid (story 15).
//
// A pure function of (user, member, links) so every bundle is table-tested
// without Payload. The caller resolves the Member and the Partner link (both
// are field-locked to `users`, so Cecilija re-reads them with `overrideAccess`)
// and handles the anonymous case: no session at all is a redirect to
// `/app/login`, not a denial page.

import { can, type PermissionUser } from '@/lib/access/permissions'
import { isMoreskantRow } from '@/lib/moreskant-profile'
import { appNav, unlockedScreens, type AppNav, type AppScreen } from './screens'

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
  | {
      kind: 'ok'
      /** Every screen this account may open, in bar order. Never empty. */
      screens: AppScreen[]
      /** The bar, the overflow, the landing route and the sidebar groups. */
      nav: AppNav
      /** The account's own dancer row, when there is one. */
      self: AppMember | null
      /** The Partners row a `partner` login is scoped to, when there is one. */
      partnerId: string | null
    }
  | { kind: 'denied' }

/** The links the two conditional permissions hang on. */
export interface AppLinks {
  partnerId?: string | null
}

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
 * THE Cecilija access decision. `member` is the Member `user.member` points at,
 * already loaded, or null when the login carries no link; `links.partnerId` is
 * the Partners row behind `user.partner`, resolved the same way.
 */
export function decideAppAccess(
  user: PermissionUser,
  member: AppMember | null | undefined,
  links: AppLinks = {},
): AppAccess {
  if (!user) return { kind: 'denied' }

  const partnerId = links.partnerId == null ? null : String(links.partnerId)
  const ctx = { hasMember: isActiveMoreskant(member), hasPartner: partnerId !== null }

  const screens = unlockedScreens(user, ctx)
  if (screens.length === 0) return { kind: 'denied' }

  // `self` is the account's own dancer row: set only when it holds `moreskant`
  // AND that row is a live moreškant, which is the same bar the permission
  // itself has to clear. A voditelj without it is a voditelj who does not dance.
  const self = can(user, 'moreskant') && ctx.hasMember ? (member as AppMember) : null

  return { kind: 'ok', screens, nav: appNav(user, ctx), self, partnerId }
}

/** The Member whose nickname and roles the app chrome shows, if any. */
export function accessMember(access: AppAccess): AppMember | null {
  return access.kind === 'ok' ? access.self : null
}
