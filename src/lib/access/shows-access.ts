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
 * Create: both holders of the schedule create either kind of performance
 * (#567, Q53).
 *
 * It used to be "the backoffice creates anything, a voditelj creates non-public
 * performances only", carried by an override in the collection's beforeValidate
 * hook because Payload reads a `Where` on create as plain "allowed". Izvedbe is
 * now one register for both halves: a voditelj enters the season's public
 * evenings as readily as the secretary enters a cruise call, and what a public
 * evening COSTS — cancelling it, moving its date or its house, its ledger and
 * its pause — is gated action by action instead
 * (`src/lib/app/performance-actions.ts`), in each action's own route.
 *
 * What did NOT widen is editing a public row's schedule in the Backoffice:
 * {@link canEditScheduleField} still refuses a voditelj the date, the time, the
 * house and the status of a public evening, because changing one there mails
 * nobody. On Cecilija those are named actions that do tell the buyers.
 */
export function showsCreateAccess(user: PermissionUser): boolean {
  return isScheduleHolder(user)
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
 * The public flag on an EXISTING row: `tickets` only.
 *
 * Turning a selling evening private (or a private one into a seller) changes
 * what a row IS after people may already hold tickets for it, so it stays with
 * the desk that answers for those tickets.
 */
export function canSetPublicFlag(user: PermissionUser): boolean {
  return can(user, 'tickets')
}

/**
 * The public flag on a NEW row: either holder of the schedule (#567, Q53).
 *
 * A voditelj entering next season's Redovna dates has to be able to say that
 * they sell tickets. It is a create-only widening on purpose: nothing is sold
 * yet and nobody has been told anything, which is exactly what makes the same
 * flip on an existing row the blagajna's.
 */
export function canAuthorPublicFlag(user: PermissionUser): boolean {
  return isScheduleHolder(user)
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

/*
 * `nonPublicAuthoringOverrides` lived here until #567 (Q53).
 *
 * It forced every create by a `moreska` holder without `tickets` to be
 * non-public and non-redovna, because Payload's field-access pass drops a
 * denied value and falls back to the field's default — and `isPublic` defaults
 * to `true`, so a refused voditelj's create would silently have landed as a
 * public row. With the create side of the flag open to both halves
 * (`canAuthorPublicFlag`) there is no denied value to fall back from, and the
 * two remaining invariants are the validator's: a Redovna is always public, and
 * a public evening needs a house while a booking needs a place.
 */
