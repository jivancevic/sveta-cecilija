// Who may see and change an attendance row (#422, ADR-0023 × ADR-0024).
//
// One rule, two audiences:
//   - `moreska` — the voditelj. Every row, read and write: the whole point of
//     the collection is that they hold the season's headcount.
//   - `moreskant` — a dancer. Only rows whose `member` is their own link, as a
//     `Where`, so the stock Payload CRUD can never hand a dancer somebody
//     else's answer.
// Nobody else, including `tickets`: roster data stays inside the voditelj
// circle (#419, story 39).
//
// The TIME rule ("only before the performance starts") deliberately does NOT
// live here. A `Where` cannot express "the related performance has not started
// yet" without a join, so it lives in the answer route's pure rules
// (`src/lib/attendance/rules.ts`), which is the only writer the app itself
// uses. Collection access scopes rows by member; the route scopes them by time.
//
// Pure predicates, unit-tested in `src/collections/access.test.ts`;
// `src/collections/Attendance.ts` is only the wiring.

import { can, type PermissionUser } from './permissions'
import { relationId } from '@/lib/payload-relation'
import type { Where } from 'payload'

/**
 * READ: the voditelj sees every row; a dancer sees their own, as a `Where`.
 *
 * `ownMemberId` is the caller's own Members link, already resolved. A
 * `moreskant` without one owns nothing — never everything.
 */
export function attendanceReadAccess(
  user: PermissionUser,
  ownMemberId: string | number | null | undefined,
): boolean | Where {
  if (can(user, 'moreska')) return true
  if (!can(user, 'moreskant')) return false
  if (ownMemberId == null) return false
  return { member: { equals: ownMemberId } }
}

/**
 * CREATE / UPDATE / DELETE: `moreska` and nobody else.
 *
 * A `Where` must never be returned here, and a dancer must never be allowed
 * through. Payload's create operation only tests the access result for
 * TRUTHINESS (`collections/operations/create.js`), so a `Where` reads as "yes,
 * go ahead" and the row's own values are never checked against it: a signed-in
 * moreškant could POST `/api/attendance` with anybody's member id, any army,
 * after the start, on a cancelled izvedba — and PATCH an existing row to
 * re-point its `member`. The `/app` session cookie is the same `payload-token`
 * the admin REST API accepts, so that is a real reachable path, not a
 * theoretical one.
 *
 * A dancer loses nothing: `/app` never writes through collection access. Its
 * answer route runs `overrideAccess: true` and applies
 * `src/lib/attendance/rules.ts`, which is where "only your own row, only before
 * the start" actually lives. What is left here is the voditelj's admin CRUD.
 */
export function attendanceWriteAccess(user: PermissionUser): boolean {
  return can(user, 'moreska')
}

/**
 * The sidebar entry. The voditelj gets a stock CRUD view so a wrong row can be
 * fixed without the developer (#419, story 18); a dancer answers in `/app` and
 * has no business in `/admin` at all.
 */
export function attendanceHiddenInAdmin(user: PermissionUser): boolean {
  return !can(user, 'moreska')
}

/** The minimum of Payload's local API this module's IO half needs. */
export interface MemberLinkReader {
  findByID: (args: {
    collection: 'users'
    id: string | number
    depth: number
    overrideAccess: boolean
  }) => Promise<unknown>
}

/**
 * The caller's own Members link.
 *
 * `Users.member` is field-locked to `users` (#420), so `req.user` arrives
 * WITHOUT it — by design, so a moreškant cannot repoint themselves. Every
 * consumer therefore has to re-read the account with `overrideAccess`, the same
 * thing `src/lib/app/viewer.ts` does for the `/app` access decision. A dangling
 * or unreadable link resolves to null, which every caller treats as "owns
 * nothing".
 */
export async function resolveOwnMemberId(
  payload: MemberLinkReader | undefined,
  user: { id?: string | number; member?: unknown } | null | undefined,
): Promise<string | number | null> {
  if (!user?.id) return null
  const direct = relationId(user.member)
  if (direct != null) return direct
  if (!payload?.findByID) return null
  try {
    const account = (await payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 0,
      overrideAccess: true,
    })) as { member?: unknown } | null
    return relationId(account?.member)
  } catch {
    return null
  }
}
