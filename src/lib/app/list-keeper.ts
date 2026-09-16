// `keepsList` — the one predicate about a ROW (ADR-0029, #658).
//
// Every other access decision in this repository is a question about a PERSON:
// `can(user, 'refunds')`. This one is a question about a person AND an evening.
// Running an evening's list is `moreska`'s work and `moreska` is two people, so
// an evening neither of them attends had nobody who could record it. The repair
// is a delegation bounded by the evening — the *Zaduženi* (CONTEXT.md) — and a
// delegation bounded by a row cannot be expressed as a permission, because a
// permission is global and permanent and this is neither.
//
// The two rules that keep it honest, both of them load-bearing:
//
//   - It never REPLACES the route guard, it follows it. A route still calls
//     `requirePermission(req, ['moreska','moreskant'])` — "may this caller be
//     in here at all" — and then asks this "is this their evening", against the
//     row it has loaded. A guard that decides on the session alone cannot
//     answer the second question, which is the whole cost of the design.
//   - It never grows into `can()` and no `list_keeper` word is ever added to
//     the vocabulary. Either one would turn one night's delegation into a
//     permanent, global grant: exactly what ADR-0029 refuses.
//
// The alarm is deliberately outside all of this: `/api/app/alarm` keeps plain
// `requirePermission(req, 'moreska')`. Ringing seventy-six phones is not part
// of keeping a list.
//
// Pure over (actor, row), so it is table-tested without a database.

import { can, type PermissionUser } from '@/lib/access/permissions'
import { relationIdString } from '@/lib/payload-relation'

/**
 * Who is asking.
 *
 * `memberId` is the actor's OWN **live** Member link — live because that is the
 * bar the `moreskant` permission itself has to clear (`decideAppAccess`): untick
 * `active` or `isMoreskant` and the dancer is out on their next request. The
 * caller resolves it (`Users.member` is field-locked to `users`, so Cecilija
 * re-reads it with `overrideAccess`) and hands null when there is none.
 */
export interface ListKeeperActor {
  user: PermissionUser
  memberId: string | null
}

/** The performance row, at any depth: only its `listKeepers` is read. */
export interface ListKeeperRow {
  listKeepers?: unknown
}

/**
 * The Members named on one evening, as strings.
 *
 * A relationship arrives as bare ids at `depth: 0` and as populated documents
 * deeper, and this is read from both a loader and a route, so it normalises
 * both. Anything that is not an id at all is dropped rather than thrown: a
 * hand-edited row must not be able to 500 a screen.
 */
export function listKeeperIds(row: ListKeeperRow | null | undefined): string[] {
  const value = row?.listKeepers
  if (!Array.isArray(value)) return []
  return value.map(relationIdString).filter((id): id is string => id !== null)
}

/**
 * May this person keep the list of THIS evening?
 *
 * True for a `moreska` holder on every row, named on it or not — a voditelj
 * keeps every list and is never written down as a zaduženi, which is why
 * *Stanje* says "Popis vodi: …" only when somebody else is.
 *
 * True for a moreškant whose own live Member is named on the row. False for
 * everybody else, including a `tickets` login whose Member happens to be named:
 * the list belongs to the dance, not to the ticket shop.
 *
 * A missing row is false for everyone. "No evening" is not an evening whose
 * list a voditelj keeps, and a caller that has not loaded its row has not
 * earned an answer.
 */
export function keepsList(
  actor: ListKeeperActor,
  row: ListKeeperRow | null | undefined,
): boolean {
  return keepsListAs(
    {
      voditelj: can(actor.user, 'moreska'),
      // Only a moreškant can be a zaduženi: the list belongs to the dance. A
      // login that holds neither word brings no member to the comparison.
      memberId: can(actor.user, 'moreskant') ? actor.memberId : null,
    },
    row,
  )
}

/**
 * The same rule, for a caller that has already resolved the two facts.
 *
 * The roster loader knows `voditelj` and the viewer's Member but has no `Users`
 * row to ask `can()` about, and the answer must not be allowed to differ from
 * the one the route reaches — a screen that offers a button the route refuses is
 * the failure this seam exists to prevent. So both go through here, and
 * {@link keepsList} is only the half that turns a session into these two facts.
 */
export function keepsListAs(
  viewer: { voditelj: boolean; memberId: string | null },
  row: ListKeeperRow | null | undefined,
): boolean {
  if (!row) return false
  if (viewer.voditelj) return true
  if (viewer.memberId == null) return false
  return listKeeperIds(row).includes(String(viewer.memberId))
}
