// "Ima prijavu": which Members already have a login (#424, #419 story 9).
//
// The voditelj's Members list needs one boolean per row — has this dancer been
// invited yet? — and the answer lives in the OTHER table: `users.member`. There
// is no join to lean on, so the naive shapes are a query per row (an
// `afterRead` hook doing its own lookup) or a query per rendered cell (a client
// Cell component fetching `/api/users`). Both cost a page-load's worth of
// round trips for a column nobody sorts on.
//
// Instead: ONE `find` per request, memoized on `req.context`, which Payload
// shares across every document of a single operation. The promise itself is
// cached rather than the result, so parallel `afterRead` hooks queue behind the
// first query instead of firing their own.
//
// The lookup runs with `overrideAccess: true` on purpose: it answers "does a
// login exist", never "what is in it", and the reader has already passed the
// Members collection access.

import { relationIdString } from '@/lib/payload-relation'

/** The slice of Payload this needs. */
export interface UserLinkFinder {
  find: (args: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[] }>
}

/** Where the memo lives on `req.context`. */
export const MEMBER_LOGIN_CONTEXT_KEY = '__memberIdsWithLogin'

type ContextLike = Record<string, unknown> | undefined | null

/** Every Member id that some account's `member` link points at, as strings. */
export async function loadMemberIdsWithLogin(payload: UserLinkFinder): Promise<Set<string>> {
  const result = await payload.find({
    collection: 'users',
    where: { member: { exists: true } },
    // The society has tens of members, not thousands: one unpaginated page.
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const ids = new Set<string>()
  for (const doc of result.docs ?? []) {
    const id = relationIdString(doc.member)
    if (id) ids.add(id)
  }
  return ids
}

/**
 * The memoized flavour: the same set for every row of one list view.
 *
 * A missing context (a hook called outside a request) simply means no memo, not
 * an error: the query runs, the answer is right, only the saving is lost.
 */
export function memberIdsWithLogin(
  payload: UserLinkFinder | undefined,
  context: ContextLike,
): Promise<Set<string>> {
  if (!payload?.find) return Promise.resolve(new Set<string>())
  if (!context) return loadMemberIdsWithLogin(payload)

  const cached = context[MEMBER_LOGIN_CONTEXT_KEY]
  if (cached instanceof Promise) return cached as Promise<Set<string>>

  const pending = loadMemberIdsWithLogin(payload).catch(() => new Set<string>())
  context[MEMBER_LOGIN_CONTEXT_KEY] = pending
  return pending
}
