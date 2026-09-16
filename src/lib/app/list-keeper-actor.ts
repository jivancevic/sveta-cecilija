// Turning a session into the actor `keepsList` reasons about (#658).
//
// The IO half of `./list-keeper.ts`, kept in its own file so that one stays
// pure: it is imported by `attendance/rules.ts` and `lineup/replace.ts`, both of
// which are unit-tested without a database, and a `getPayload` anywhere in that
// import graph would end that.
//
// The whole job is resolving the caller's own LIVE Member. Three reasons it
// cannot be read off the session:
//
//   - `Users.member` is field-locked to `users` (#420), so the authenticated
//     user object does not carry it;
//   - "live" is a fact about the ROSTER, not the login table — untick `active`
//     or `isMoreskant` and the dancer is out on their next request (ADR-0024) —
//     so the Member row has to be read too;
//   - and the rule for that is already written once, in `decideAppAccess`, which
//     is what the page gate applies. A second opinion here is exactly how a
//     route and a page drift.
//
// So this delegates to `resolveAppAccessFor` and reads `access.self`, which is
// null for everybody who is not a live dancer — a non-dancing voditelj
// included, who needs no Member because `keepsList` lets them through on the
// permission.

import { resolveAppAccessFor, type ViewerPayload } from './viewer'
import type { ListKeeperActor } from './list-keeper'

/**
 * The actor for a `/api/app` route that has already authenticated its caller.
 *
 * A failure to resolve the Member is not an error: it is an actor with no
 * Member, which `keepsList` refuses unless they hold `moreska`. The access
 * decision is the caller's own, so a denial there means the same thing.
 */
export async function listKeeperActor(
  payload: ViewerPayload,
  user: { id: string | number; permissions?: unknown },
): Promise<ListKeeperActor> {
  const { access } = await resolveAppAccessFor(payload, user)
  const self = access.kind === 'ok' ? access.self : null
  return { user, memberId: self ? String(self.id) : null }
}
