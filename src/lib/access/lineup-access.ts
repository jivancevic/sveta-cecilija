// Who may see and change a lineup row (#432, ADR-0023 × ADR-0024).
//
// The attendance shape with one difference, and the difference is the whole
// feature: a dancer's read is scoped by the PERFORMANCE's confirmation flag
// rather than by their own member link. A confirmed lineup is society-wide
// news ("I know I am kralj tonight", story 33); a DRAFT is a half-typed list
// that must reach nobody (story 34).
//
//   - `moreska` — the voditelj. Every row, read and write.
//   - `moreskant` — a dancer. Only rows of a confirmed performance, as a
//     `Where`, so the stock Payload CRUD can never hand out a draft.
// Nobody else, `tickets` included: roster data stays inside the voditelj circle.
//
// WRITES ARE `moreska`-ONLY AND A BOOLEAN, never a `Where`. Payload's create
// operation only tests the access result for truthiness, so a `Where` there
// would read as a plain "allowed" and let any signed-in dancer POST
// `/api/lineups` for anybody with the session cookie `/app` hands them — the
// same hole `attendance-access.ts` documents at length. Dancers lose nothing:
// they never write a lineup at all, by design.
//
// Pure predicates, unit-tested in `src/collections/access.test.ts`;
// `src/collections/Lineups.ts` is only the wiring.

import { can, type PermissionUser } from './permissions'
import type { Where } from 'payload'

/**
 * READ: the voditelj sees every row; a dancer sees the confirmed ones.
 *
 * The `Where` reaches through the relationship (`performance.lineupConfirmed`)
 * rather than carrying a list of ids, so it cannot go stale between the moment
 * access is decided and the moment the query runs — a lineup unlocked mid
 * request stops being visible immediately, which is what "never a draft" means.
 */
export function lineupReadAccess(user: PermissionUser): boolean | Where {
  if (can(user, 'moreska')) return true
  if (!can(user, 'moreskant')) return false
  return { 'performance.lineupConfirmed': { equals: true } }
}

/**
 * CREATE / UPDATE / DELETE: `moreska` and nobody else, as a boolean.
 *
 * See the file header for why this must never become a `Where`.
 */
export function lineupWriteAccess(user: PermissionUser): boolean {
  return can(user, 'moreska')
}

/**
 * The sidebar entry. The voditelj gets stock CRUD so a wrong row can be fixed
 * without the developer, exactly as for attendance; everyone else, the
 * backoffice included, never sees the collection.
 */
export function lineupHiddenInAdmin(user: PermissionUser): boolean {
  return !can(user, 'moreska')
}
