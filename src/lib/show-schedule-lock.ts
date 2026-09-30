// The last quiet way to move a sold evening, and the rule that closes it (#689).
//
// Three surfaces can write a public show's `date` or `time`. Exactly ONE of them
// tells the buyers, and one of the other two used to say nothing at all:
//
//   - `POST /api/shows/[id]/reschedule` (#379, widened to the hour by #688) is
//     the one that tells them: it mails every buyer, reissues every ticket on the
//     same QR tokens and stamps `date_changed_at`, which is what opens the
//     self-serve refund (ADR-0021).
//   - Cecilija's **Uredi** form does not tell anybody either, and does not have
//     to: it REFUSES the hour and the house of a sold row with a 409 that names
//     the action above.
//   - The raw **Shows** form in the Backoffice did neither. `canEditScheduleField`
//     asks WHICH PERMISSION the editor holds and never WHETHER THE EVENING HAS
//     SOLD A TICKET, so a `tickets` holder could type a new hour, save, and leave
//     somebody holding a PDF printing the old one — and, since #674, a derived
//     entrance time that is wrong with it.
//
// That third hole is what this file closes, as a decision rather than as a field
// lock: field access is per-field and would need a ticket count per render, while
// `readOnly` would also refuse the harmless case — correcting a typo on an
// evening nobody has bought into. So the rule is asked once, in a `beforeChange`
// hook, over the two snapshots Payload already has:
//
//     a PUBLIC row + a moved date or time + at least one active ticket = refuse
//
// It runs for every writer of the collection — the admin form, the REST API,
// GraphQL, the local API — and cannot be bypassed by loosening field access.
// `reschedule` is outside it by construction rather than by an exemption: it
// claims the move with raw SQL, so no collection hook fires for it. (So do
// `cancel` and `move-to-indoor`, but neither writes `date` or `time`, so neither
// would meet this rule even if it did go through the collection.)
//
// Everything here is pure and takes its one fact (the ticket count) as a
// dependency, so the rule is unit-tested without a database; `Shows.ts` is only
// the wiring.

import { RESCHEDULE_ACTION_LABEL } from '@/lib/show-reschedule'
import { isPublicPerformance } from '@/lib/show-performance'
import { toIsoDate } from '@/lib/to-iso-date'

/** A Shows row or a patch of one, as Payload hands it to a collection hook. */
export type ScheduleRow = Record<string, unknown> | undefined

/** The two halves of a start instant, named the way the copy names them. */
export type ScheduleHalf = 'date' | 'time'

/**
 * Which halves of the schedule this save would move.
 *
 * Both sides are normalised before they are compared, because the two columns
 * arrive in different shapes depending on the writer: `date` is a `timestamptz`
 * that reads back as a `Date` through the local API and as an ISO string through
 * REST, and `time` is free text that is trimmed.
 *
 * The day is compared as a bare YYYY-MM-DD in **UTC**, which is this repo's one
 * definition of a show's day (`toIsoDate`) and is safe here for a reason worth
 * writing down, because the opposite conclusion is the tempting one. Saving a
 * sold evening re-posts the whole document, so a comparison that mistook an
 * untouched value for a move would refuse every ordinary save on a selling show.
 * It cannot: Payload's `dayOnly` picker normalises a day the editor PICKS to noon
 * UTC (`DatePicker.onChange` sets `12 - tzOffset` local hours, in any timezone),
 * and a day the editor does not touch goes back as the very instant it arrived
 * as. So an untouched value is byte-identical and a picked one is at noon, which
 * is the middle of the UTC day from either side.
 *
 * A hand-written REST client is free to post an instant near a UTC midnight, and
 * that can read as the neighbouring day. The cost of being wrong that way is a
 * 409 on a save that should have gone through — the safe direction, and one that
 * names the action to use instead.
 *
 * What keeps the ordinary save — a note, a threshold, a sold counter ticking on a
 * sale — outside the rule is the comparison of VALUES, and not the absence of a
 * key. On Payload's own path there is no absence to rely on: the field-level
 * `beforeValidate` pass runs before this collection hook and fills every key the
 * patch omitted with a clone of the stored value (`getFallbackValue`), so by the
 * time the decision is asked, `data` carries the whole document. The `in` checks
 * below are the belt for a caller that hands over a bare patch, and cost nothing.
 */
export function scheduleMove(original: ScheduleRow, patch: ScheduleRow): ScheduleHalf[] {
  const before = original ?? {}
  const after = patch ?? {}
  const moved: ScheduleHalf[] = []
  if ('date' in after && toIsoDate(after.date) !== toIsoDate(before.date)) moved.push('date')
  if ('time' in after && timeOf(after.time) !== timeOf(before.time)) moved.push('time')
  return moved
}

function timeOf(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * The refusal, naming the half that moved and the action that would have told
 * the buyers.
 *
 * English, like the rest of this form's own copy (the field validators, the
 * `admin.description` lines): the Backoffice is developer-facing, and the action
 * it names is the label of the edit-menu item sitting on the very same screen —
 * which is why {@link RESCHEDULE_ACTION_LABEL} is one constant that the button
 * itself renders, rather than the same sentence typed in three places that can
 * drift apart. Cecilija's sibling refusal is Croatian and names *Pomakni termin*,
 * because that is what its reader sees (`APP_STRINGS.performance.timeLocked`).
 */
export function scheduleLockMessage(moved: readonly ScheduleHalf[]): string {
  const what =
    moved.length > 1 ? 'date and start time' : moved[0] === 'time' ? 'start time' : 'date'
  return (
    `This show has sold tickets, so its ${what} cannot be changed on this form: ` +
    `it would move the evening and tell nobody. Use "${RESCHEDULE_ACTION_LABEL}" ` +
    'in the edit menu instead — it mails every buyer, reissues their tickets on the same QR ' +
    'codes and opens the self-serve refund.'
  )
}

export interface ScheduleLockDeps {
  /** Active tickets on this row: the one fact the decision cannot derive. */
  activeTickets: (showId: string) => Promise<number>
}

export interface ScheduleLockInput {
  operation: 'create' | 'update'
  /** The stored row. Absent on a create, and then there is nothing to move. */
  original?: ScheduleRow
  /** The incoming data, which may carry only the fields that changed. */
  patch?: ScheduleRow
}

export type ScheduleLockDecision =
  | { refuse: false; moved: ScheduleHalf[] }
  | { refuse: true; moved: ScheduleHalf[]; message: string }

/**
 * Whether this save is the quiet path, and therefore refused.
 *
 * The count is asked only when a public row's schedule actually moved, so the
 * common save costs no query at all — which matters because every online sale
 * writes a Shows row.
 *
 * What the count COUNTS is every active ticket, whatever channel it came through
 * — an online sale, a partner's counter, a comp. The question is not "will an
 * email go out", it is "is anybody holding a document that prints this hour", and
 * a partner's buyer and a comped member hold exactly the same PDF. Cecilija's
 * sibling lock reads the same number for the same reason (#688).
 *
 * Publicness is read from the row as it is AND as it would be: a save that
 * moves the hour while turning a sold evening private would otherwise slip out
 * from under the rule on the way past. The reverse direction is free anyway,
 * since a row that has never been public has sold nothing.
 */
export async function decideScheduleLock(
  input: ScheduleLockInput,
  deps: ScheduleLockDeps,
): Promise<ScheduleLockDecision> {
  const moved = input.operation === 'update' ? scheduleMove(input.original, input.patch) : []
  if (moved.length === 0) return { refuse: false, moved }

  const original = (input.original ?? {}) as Record<string, unknown>
  const merged = { ...original, ...((input.patch ?? {}) as Record<string, unknown>) }
  if (!isPublicPerformance(original) && !isPublicPerformance(merged)) {
    return { refuse: false, moved }
  }

  const id = original.id
  if (id === undefined || id === null || id === '') return { refuse: false, moved }
  if ((await deps.activeTickets(String(id))) < 1) return { refuse: false, moved }

  return { refuse: true, moved, message: scheduleLockMessage(moved) }
}
