// "Poveži svoj račun s članom": the one hole in the `Users.member` lock (#462).
//
// `Users.member` is field-locked to a `users` holder for READ and WRITE
// (`src/collections/Users.ts`), and that lock is load-bearing: it is the reason
// a dancer cannot repoint their own login at somebody else's Member and inherit
// their identity. The cost was that a voditelj who also dances could not fill
// the link in either, and `decideAppAccess` handed them `{ kind: 'voditelj',
// self: null }` — a state that is perfectly valid for a voditelj who does not
// dance (#419, story 15) and indistinguishable from one whose link was simply
// never set. Until #462 the only repair was a `users` holder editing the row by
// hand, which in practice is one person for the whole society.
//
// So this is a narrow, permission-checked hole in the lock rather than a
// relaxation of it, and the four rules below are what keep it narrow:
//
//  1. the caller holds `moreska` (the ROUTE's job: `requirePermission` first);
//  2. the caller has NO link yet. Repointing an existing one stays a `users`
//     job, because a self-edit path that can move a link is the very thing the
//     lock exists to prevent;
//  3. the target is an active moreškant;
//  4. NOBODY's login already points at that Member. Linking to a Member that
//     has an account is not a convenience, it is taking over their identity.
//
// Pure + DI like every other `/app` handler: no Payload, no fetch, so each rule
// is a row in link-self.test.ts. `src/app/api/app/link-self/route.ts` is the
// wiring, and `src/lib/app/link-self-data.ts` loads the list the screen offers
// through the same `memberEligibility` rule the POST re-applies.

import { isMoreskantRow } from '@/lib/moreskant-profile'
import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'

/** The Member fields the decision reads. Never an email (ADR-0024 PII boundary). */
export interface LinkSelfMember {
  id: string | number
  name?: string | null
  nickname?: string | null
  roles?: unknown
  primaryRole?: unknown
  active?: unknown
  isMoreskant?: unknown
}

/** One line of the list the screen offers. A projection, never a spread. */
export interface LinkSelfCandidate {
  id: string
  name: string
  nickname: string | null
  roles: string[]
  primaryRole: string | null
}

/**
 * Why a Member may not be linked, or null when it may.
 *
 * One vocabulary for the list and for the POST: the screen only ever offers
 * rows the rule answers `null` for, and the route re-derives the same answer
 * for the row it is handed, so a stale tab is refused by the rule that hid the
 * line rather than by a second one that could disagree with it.
 */
export type LinkRefusal = 'missing' | 'not-moreskant' | 'not-active' | 'taken'

/** The Croatian sentence for each refusal. */
export const LINK_REFUSAL_MESSAGES: Record<LinkRefusal, string> = {
  missing: APP_STRINGS.linkSelf.notFound,
  'not-moreskant': APP_STRINGS.linkSelf.notMoreskant,
  'not-active': APP_STRINGS.linkSelf.notActive,
  taken: APP_STRINGS.linkSelf.taken,
}

/**
 * May this Member be a self-link target?
 *
 * `hasLogin` is the caller's answer to "does some account already point here",
 * which is a fact about the OTHER table and so cannot be read off the row.
 */
export function memberEligibility(
  member: LinkSelfMember | null | undefined,
  hasLogin: boolean,
): LinkRefusal | null {
  if (!member || member.id == null) return 'missing'
  if (!isMoreskantRow(member as unknown as Record<string, unknown>)) return 'not-moreskant'
  // `active` defaults to true in the collection, so only an explicit false retires.
  if (member.active === false) return 'not-active'
  if (hasLogin) return 'taken'
  return null
}

/** A Member row as the screen lists it. */
export function toCandidate(member: LinkSelfMember): LinkSelfCandidate {
  const roles = Array.isArray(member.roles)
    ? member.roles.filter((r): r is string => typeof r === 'string')
    : []
  return {
    id: String(member.id),
    name: typeof member.name === 'string' ? member.name : '',
    nickname: typeof member.nickname === 'string' ? member.nickname : null,
    roles,
    primaryRole: typeof member.primaryRole === 'string' ? member.primaryRole : null,
  }
}

/**
 * The roster, filtered to the rows a voditelj may claim as themselves, in the
 * order the list shows them: by nickname, then by name, the way a person scans
 * a list for their own.
 */
export function eligibleCandidates(
  members: readonly LinkSelfMember[],
  memberIdsWithLogin: ReadonlySet<string>,
): LinkSelfCandidate[] {
  return members
    .filter((m) => memberEligibility(m, memberIdsWithLogin.has(String(m.id))) === null)
    .map(toCandidate)
    .sort((a, b) =>
      (a.nickname || a.name).localeCompare(b.nickname || b.name, 'hr', { sensitivity: 'base' }),
    )
}

/** The caller's permission set, with anything that is not a string dropped. */
export function heldPermissions(permissions: readonly unknown[] | undefined): string[] {
  return (permissions ?? []).filter((p): p is string => typeof p === 'string')
}

/**
 * What a linked voditelj ends up holding: their own set, plus `moreskant`, and
 * nothing else. A union rather than an assignment — this route fills in a
 * missing link, it never changes what an account may do.
 */
export function withMoreskant(permissions: readonly unknown[] | undefined): string[] {
  const held = heldPermissions(permissions)
  return held.includes('moreskant') ? held : [...held, 'moreskant']
}

export interface LinkSelfResult {
  status: number
  body: { ok: true; memberId: string; message: string } | { error: string }
}

export interface LinkSelfDeps {
  /** Origin / Sec-Fetch-Site / Content-Type, plus the origins we own. */
  request: AppRequestMeta
  /**
   * The calling login: its id, its permission set exactly as stored, and
   * whether it is a shared account (ADR-0022).
   */
  caller: { id: string | number; permissions?: readonly unknown[]; shared?: unknown }
  /**
   * The caller's CURRENT `member` link, re-read server-side with
   * `overrideAccess` rather than taken off the session, which may predate a
   * relink an administrator has since made.
   */
  callerMemberId: string | null
  loadMember: (id: string) => Promise<LinkSelfMember | null>
  /** Ids of every login whose `member` points at this Member. Normally none. */
  findUserIdsByMember: (memberId: string) => Promise<string[]>
  /** Writes `Users.member` + the permission set, with `overrideAccess: true`. */
  link: (userId: string | number, data: { member: string; permissions: string[] }) => Promise<void>
  /** Clears both again. Used only when the exclusivity re-check loses a race. */
  unlink: (userId: string | number, data: { permissions: string[] }) => Promise<void>
}

function fail(status: number, error: string): LinkSelfResult {
  return { status, body: { error } }
}

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

/**
 * POST /api/app/link-self `{ memberId }`.
 *
 * 403/415 for a cross-site or non-JSON request (this is a cookie-authenticated
 * POST that decides who an account is). 409 when the caller already carries a
 * link or the Member already has one, 400 for the profile problems a voditelj
 * can fix on the Member form, 200 otherwise.
 *
 * **The exclusivity check runs twice**, once before the write and once after,
 * because between the two there is a window in which a second voditelj can
 * claim the same Member. Losing that race un-links rather than leaving two
 * logins on one dancer: both callers backing out is recoverable by pressing the
 * button again, two identities sharing a Member is not. A unique index would be
 * the stronger guard, but `users.member` has carried hand-set values since #420
 * and a bootstrap index that fails on legacy data is a worse outage than a race
 * nobody has run yet.
 */
export async function handleLinkSelf(
  input: { memberId?: unknown } | null | undefined,
  deps: LinkSelfDeps,
): Promise<LinkSelfResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return fail(rejection.status, APP_STRINGS.linkSelf.rejected)

  // A shared login is not a person and cannot be a dancer (ADR-0022): several
  // volunteers hold it, so "this is me" has no answer. `Users.access.update`
  // already forbids a shared account editing its own row; this route runs with
  // `overrideAccess`, so it carries the same rule itself (#462 review).
  if (deps.caller.shared === true) return fail(403, APP_STRINGS.linkSelf.sharedAccount)

  // Rule 2, before anything is read: a login that already knows who it is may
  // not change its mind here. That is `users` work, and it is the whole reason
  // `Users.member` is locked in the first place.
  if (deps.callerMemberId) return fail(409, APP_STRINGS.linkSelf.alreadyLinked)

  const memberId = id(input?.memberId)
  if (!memberId) return fail(400, APP_STRINGS.linkSelf.missingMember)

  let member: LinkSelfMember | null = null
  try {
    member = await deps.loadMember(memberId)
  } catch {
    member = null
  }

  let taken: string[]
  try {
    taken = await deps.findUserIdsByMember(memberId)
  } catch {
    // An unreadable Users table must not read as "free": refusing is the safe
    // direction when the question is "does somebody already own this identity".
    return fail(500, APP_STRINGS.linkSelf.failed)
  }

  const refusal = memberEligibility(member, taken.length > 0)
  if (refusal) {
    return fail(refusal === 'taken' ? 409 : 400, LINK_REFUSAL_MESSAGES[refusal])
  }

  try {
    await deps.link(deps.caller.id, {
      member: memberId,
      permissions: withMoreskant(deps.caller.permissions),
    })
  } catch {
    return fail(500, APP_STRINGS.linkSelf.failed)
  }

  // The second half of the exclusivity check. Anybody else on this Member now
  // means we lost a race, so back the link out; the sentence is the one a taken
  // Member always gets, because that is what happened.
  let after: string[] = []
  try {
    after = await deps.findUserIdsByMember(memberId)
  } catch {
    after = []
  }
  if (after.some((userId) => userId !== String(deps.caller.id))) {
    try {
      await deps.unlink(deps.caller.id, { permissions: heldPermissions(deps.caller.permissions) })
    } catch {
      // A failed revert leaves the link this request created. Say the same
      // thing either way and let a `users` holder see two rows on one Member.
      console.error('[handleLinkSelf] could not revert a lost race on member', memberId)
    }
    return fail(409, APP_STRINGS.linkSelf.taken)
  }

  return {
    status: 200,
    body: { ok: true, memberId, message: APP_STRINGS.linkSelf.linked },
  }
}
