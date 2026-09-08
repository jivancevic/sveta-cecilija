// Who may see and change which performance (ADR-0023 permissions × ADR-0024
// performances, #408). This is the first thing the `moreska` permission gates.
//
// Three audiences meet on one table:
//   - `tickets` — the ticketing backoffice. Every row, every field, unchanged.
//   - `moreska` — the voditelj. Every row (the roster covers the whole season),
//     but only non-public rows may be created, deleted or rescheduled, and the
//     public flag is never theirs to set.
//   - `door`     — the shared tehnika login. Public performances only, so a
//     device at the door learns nothing about a private booking.
// Anyone else reaches nothing.
//
// Every predicate here is a pure function of the user (plus, where the rule
// depends on the row, the stored document), so the rules are unit-tested
// directly instead of through Payload. `src/collections/Shows.ts` is only the
// wiring.

import type { Where } from 'payload'
import { can, hasAny, type PermissionUser } from './permissions'
import { PUBLIC_PERFORMANCE_WHERE, isPublicPerformance } from '@/lib/show-performance'

/**
 * The mirror of {@link PUBLIC_PERFORMANCE_WHERE}: the rows a `moreska`-only
 * holder owns. Returned from create and delete access, so the constraint holds
 * in the admin, REST and GraphQL alike.
 */
export const NON_PUBLIC_PERFORMANCE_WHERE = { isPublic: { equals: false } } as const satisfies Where

/** The stored row, as Payload hands it to field access on an update. */
type ShowDoc = Record<string, unknown> | undefined

/** `tickets` or `moreska`: the two permissions that own the schedule. */
function isScheduleHolder(user: PermissionUser): boolean {
  return hasAny(user, ['tickets', 'moreska'])
}

/**
 * Read: the backoffice and the voditelj see every performance; the door sees
 * public ones only, expressed as a `Where` rather than a filtered list so it
 * also constrains `findByID` and the REST/GraphQL APIs.
 */
export function showsReadAccess(user: PermissionUser): boolean | Where {
  if (isScheduleHolder(user)) return true
  if (can(user, 'door')) return PUBLIC_PERFORMANCE_WHERE
  return false
}

/**
 * Create: the backoffice creates anything; a voditelj creates non-public
 * performances only. Payload treats a `Where` on create as "allowed" (it has no
 * row to filter yet), so the invariant is really carried by
 * {@link nonPublicAuthoringOverrides} in the collection's beforeValidate hook —
 * the Where documents the intent and is what the API reports as the constraint.
 */
export function showsCreateAccess(user: PermissionUser): boolean | Where {
  if (can(user, 'tickets')) return true
  if (can(user, 'moreska')) return NON_PUBLIC_PERFORMANCE_WHERE
  return false
}

/**
 * Update: both holders reach every row.
 *
 * A voditelj must be able to set the army threshold and the note on a PUBLIC
 * Redovna too (#404, voditelj stories 8 and 9), so update cannot be narrowed to
 * non-public rows the way create and delete are. What a voditelj may actually
 * change on a public row is decided field by field: {@link canEditScheduleField}
 * refuses date, time, kind, venue, status and the sales counters there, and
 * {@link canSetPublicFlag} refuses the public flag everywhere.
 */
export function showsUpdateAccess(user: PermissionUser): boolean {
  return isScheduleHolder(user)
}

/**
 * Delete: the backoffice deletes anything; a voditelj deletes only the private
 * bookings they own. A public show with sold tickets is never theirs to remove.
 */
export function showsDeleteAccess(user: PermissionUser): boolean | Where {
  if (can(user, 'tickets')) return true
  if (can(user, 'moreska')) return NON_PUBLIC_PERFORMANCE_WHERE
  return false
}

/**
 * The sidebar entry. The voditelj needs it as the roster's entry point before
 * `/app` exists (#404, story 12); the door reads shows through `/scan` and the
 * door dashboard and never lists them.
 */
export function showsHiddenInAdmin(user: PermissionUser): boolean {
  return !isScheduleHolder(user)
}

/**
 * The public flag: `tickets` only, on create and on update. A sales show can
 * only ever be born in the ticket backoffice.
 */
export function canSetPublicFlag(user: PermissionUser): boolean {
  return can(user, 'tickets')
}

/**
 * Date, time, kind, venue, status and the sales counters.
 *
 * `tickets` edits them on any row. A voditelj edits them on a non-public
 * performance (a moved ship call is corrected in one place, #404 story 3) and
 * never on a public one, where a date change mails 300 buyers (story 10).
 *
 * `doc` is the stored row; Payload passes it to field access on every update.
 * When it is missing we deny rather than guess — the safe direction.
 */
export function canEditScheduleField(user: PermissionUser, doc: ShowDoc): boolean {
  if (can(user, 'tickets')) return true
  if (!can(user, 'moreska')) return false
  if (!doc) return false
  return !isPublicPerformance(doc)
}

/**
 * The roster fields (`thresholdCrni`, `thresholdBili`, `voditeljNote`): read and
 * write for `moreska`, invisible to everyone else. A ticket admin's form stays
 * about tickets (#404, story 20).
 */
export function canReadRosterField(user: PermissionUser): boolean {
  return can(user, 'moreska')
}

/** @see canReadRosterField — same rule for writes. */
export function canEditRosterField(user: PermissionUser): boolean {
  return can(user, 'moreska')
}

/**
 * `location` and `client`: readable by anyone who can read the row, writable by
 * the backoffice and the voditelj alike.
 */
export function canEditPlacementField(user: PermissionUser): boolean {
  return isScheduleHolder(user)
}

/**
 * The invariant: a holder of `moreska` without `tickets` can never produce a
 * public row.
 *
 * Field access alone cannot carry this. Payload enforces field access during
 * the *field* beforeValidate pass, where a denied value is dropped and replaced
 * by the field's `defaultValue` — and `isPublic` defaults to `true`, so a
 * voditelj's create would silently land as public. The *collection*
 * beforeValidate hook runs after that pass, which makes it the last word: this
 * function returns the keys it must force.
 *
 * `kind` comes along because `redovna` is public by definition (the validator
 * rejects a non-public redovna), and `redovna` is the form's default: a
 * voditelj who leaves the kind alone gets `ostalo`, not a save error.
 *
 * Only an authenticated non-`tickets` session is touched. The trusted server
 * paths (Stripe webhook, bulk create, in-person sales, the seeds) call the
 * local API with no `req.user` and must pass through untouched.
 */
export function nonPublicAuthoringOverrides(
  user: PermissionUser,
  operation: string,
  merged: { isPublic?: unknown; kind?: unknown },
): { isPublic?: false; kind?: string } {
  if (operation !== 'create') return {}
  if (!user || can(user, 'tickets')) return {}

  const overrides: { isPublic?: false; kind?: string } = {}
  if (merged.isPublic !== false) overrides.isPublic = false
  if (merged.kind == null || merged.kind === 'redovna') overrides.kind = 'ostalo'
  return overrides
}
