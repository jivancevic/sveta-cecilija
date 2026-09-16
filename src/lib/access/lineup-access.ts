// Who may see and change a lineup row (#432, ADR-0023 × ADR-0024).
//
// The attendance shape with one difference, and the difference is the whole
// feature: a dancer's read is not scoped by their own member link. A lineup is
// society-wide news ("I know I am kralj tonight", story 33), and since #670
// that holds for a DRAFT too — story 34 hid one until confirmation, and
// confirmation comes after the evening, so a dancer learnt they had been kralj
// the morning after. Confirmation decides what COUNTS, not who may look
// (glossary: *Lineup (postava)*).
//
//   - `moreska` — the voditelj. Every row, read and write.
//   - `moreskant` — a dancer. Every row, read only.
// Nobody else, `tickets` included: roster data stays inside the voditelj circle.
//
// WRITES ARE `moreska`-ONLY AND A BOOLEAN, never a `Where`. Payload's create
// operation only tests the access result for truthiness, so a `Where` there
// would read as a plain "allowed" and let any signed-in dancer POST
// `/api/lineups` for anybody with the session cookie `/app` hands them — the
// same hole `attendance-access.ts` documents at length. Dancers lose nothing:
// they never write a lineup at all, by design.
//
// Pure predicates, unit-tested in `src/collections/lineup-access.test.ts`
// (which also covers the two cascade hooks, the way
// `attendance-cascade-delete.test.ts` does for #422);
// `src/collections/Lineups.ts` is only the wiring.

import { can, type PermissionUser } from './permissions'
import type { Where } from 'payload'

/**
 * READ: the voditelj and the dancer alike see every row (#670).
 *
 * It used to be a `Where` on `performance.lineupConfirmed`, which is the shape
 * this file would go back to if a draft ever had to be hidden again. It does
 * not: the postava is visible as soon as it exists, and what a dancer is still
 * kept away from — the picker, the suggestion, the warnings, the tally — is not
 * lineup ROWS and so was never this predicate's job. The return type stays
 * `boolean | Where` for that reason and because the write half below reads as a
 * deliberate boolean only next to a sibling that could have been a `Where`.
 */
export function lineupReadAccess(user: PermissionUser): boolean | Where {
  if (can(user, 'moreska')) return true
  return can(user, 'moreskant')
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
