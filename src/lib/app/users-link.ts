// Pointing a login at a partner or at a dancer (#510, #487).
//
// Both links are field-locked to a `users` holder (`Users.partner` on write,
// `Users.member` on read AND write), and the seam writes with
// `overrideAccess: true`, so **this route is the lock**. `requirePermission
// (req, 'users')` in the handler is the only thing standing where the field
// access would be, and a missing check here fails open in silence — Payload
// drops a denied field with a 200 rather than an error.
//
// The member half carries #487's rule, in the same vocabulary `/app/account`
// already refuses with (`memberEligibility`, `LINK_REFUSAL_MESSAGES`): a Member
// who already has a login is `taken`, one who is retired or not flagged a
// moreškant is refused too. The Backoffice refuses neither, and that is exactly
// how two logins end up on one dancer.
//
// What this route deliberately does NOT do is touch the permission set.
// `/app/account`'s self-link adds `moreskant` because a voditelj linking
// themselves is saying "I dance"; here a `users` holder is doing account
// administration, and #487's rule is that the second job is a permission they
// add on purpose. Two writes, two decisions, no surprise bundle.

import { APP_STRINGS } from './strings'
import {
  LINK_REFUSAL_MESSAGES,
  memberEligibility,
  type LinkSelfMember,
} from './link-self'
import type { AppRequestMeta } from './request-guard'
import {
  fail,
  loadOr404,
  rejectedRequest,
  type UsersCaller,
  type UsersResult,
  type UsersTarget,
} from './users-admin'

const S = APP_STRINGS.users

export interface LinkUserDeps {
  request: AppRequestMeta
  caller: UsersCaller
  loadUser: (id: string) => Promise<UsersTarget | null>
  loadMember: (memberId: string) => Promise<LinkSelfMember | null>
  /** Ids of every login whose `member` points here. Normally none. */
  userIdsByMember: (memberId: string) => Promise<string[]>
  partnerExists: (partnerId: string) => Promise<boolean>
  linkMember: (userId: string, memberId: string | null) => Promise<void>
  linkPartner: (userId: string, partnerId: string | null) => Promise<void>
}

/** A relation id as it arrives: a string, a number, or an explicit unlink. */
function relationInput(value: unknown): { id: string } | { unlink: true } | null {
  if (value === null) return { unlink: true }
  if (typeof value === 'number' && Number.isFinite(value)) return { id: String(value) }
  if (typeof value === 'string' && value.trim()) return { id: value.trim() }
  return null
}

/**
 * POST /api/app/users/[id]/link `{ partner? , member? }`.
 *
 * Exactly one of the two per request, either an id or `null` to unlink. 403
 * cross-site or a shared login on itself, 404 for an account that is nobody,
 * 400 for a target that cannot be linked, 409 for a Member somebody else is
 * already signed in as, 200 otherwise.
 */
export async function handleLinkUser(
  targetId: string,
  input: { partner?: unknown; member?: unknown } | null | undefined,
  deps: LinkUserDeps,
): Promise<UsersResult> {
  const rejected = rejectedRequest(deps.request)
  if (rejected) return rejected

  const found = await loadOr404(targetId, deps.loadUser)
  if ('missing' in found) return found.missing
  const user = found.user

  if (user.id === deps.caller.id && deps.caller.shared) return fail(403, S.sharedSelf)

  const wantsPartner = input != null && 'partner' in input
  const wantsMember = input != null && 'member' in input
  // One link per request: a form that could move both at once would have two
  // refusals and one outcome, and no way to say which half was applied.
  if (wantsPartner === wantsMember) return fail(400, S.link.missingTarget)

  if (wantsPartner) return linkPartner(user, input?.partner, deps)
  return linkMember(user, input?.member, deps)
}

async function linkPartner(
  user: UsersTarget,
  value: unknown,
  deps: LinkUserDeps,
): Promise<UsersResult> {
  const parsed = relationInput(value)
  if (!parsed) return fail(400, S.link.missingTarget)

  if ('id' in parsed) {
    try {
      if (!(await deps.partnerExists(parsed.id))) return fail(400, S.link.unknownPartner)
    } catch (err) {
      console.error('[handleLinkUser] partner lookup failed:', err instanceof Error ? err.message : err)
      return fail(500, S.link.failed)
    }
  }

  try {
    await deps.linkPartner(user.id, 'id' in parsed ? parsed.id : null)
  } catch (err) {
    console.error('[handleLinkUser] partner write failed:', err instanceof Error ? err.message : err)
    return fail(500, S.link.failed)
  }

  return { status: 200, body: { ok: true, partner: 'id' in parsed ? parsed.id : null, message: S.link.saved } }
}

async function linkMember(
  user: UsersTarget,
  value: unknown,
  deps: LinkUserDeps,
): Promise<UsersResult> {
  const parsed = relationInput(value)
  if (!parsed) return fail(400, S.link.missingTarget)

  if ('id' in parsed) {
    let member: LinkSelfMember | null = null
    try {
      member = await deps.loadMember(parsed.id)
    } catch {
      member = null
    }

    let holders: string[]
    try {
      holders = await deps.userIdsByMember(parsed.id)
    } catch (err) {
      // An unreadable Users table must not read as "free": refusing is the safe
      // direction when the question is "does somebody already own this
      // identity" (the same reading `/api/app/link-self` takes).
      console.error('[handleLinkUser] member lookup failed:', err instanceof Error ? err.message : err)
      return fail(500, S.link.failed)
    }

    // This account holding the link already is not a conflict, it is the
    // no-op of pressing the same row twice.
    const taken = holders.some((id) => id !== user.id)
    const refusal = memberEligibility(member, taken)
    if (refusal) {
      return fail(refusal === 'taken' ? 409 : 400, LINK_REFUSAL_MESSAGES[refusal])
    }
  }

  try {
    await deps.linkMember(user.id, 'id' in parsed ? parsed.id : null)
  } catch (err) {
    console.error('[handleLinkUser] member write failed:', err instanceof Error ? err.message : err)
    return fail(500, S.link.failed)
  }

  return { status: 200, body: { ok: true, member: 'id' in parsed ? parsed.id : null, message: S.link.saved } }
}
