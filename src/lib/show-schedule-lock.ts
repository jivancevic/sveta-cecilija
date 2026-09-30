// The last quiet way to move a sold evening, and the rule that closes it (#689).
//
// Three surfaces can write a public show's `date` or `time`, and two of them
// tell the buyers:
//
//   - `POST /api/shows/[id]/reschedule` (#379, widened to the hour by #688)
//     mails every buyer, reissues every ticket on the same QR tokens and stamps
//     `date_changed_at`, which is what opens the self-serve refund (ADR-0021).
//   - Cecilija's **Uredi** form refuses the hour and the house of a sold row
//     with a 409 naming the action that does tell them.
//   - The raw **Shows** form in the Backoffice did neither. `canEditScheduleField`
//     asks WHICH PERMISSION the editor holds and never WHETHER THE EVENING HAS
//     SOLD A TICKET, so a `tickets` holder could type a new hour, save, and
//     leave somebody holding a PDF printing the old one — and, since #674, a
//     derived entrance time that is wrong with it.
//
// That third hole is what this file closes, as a decision rather than as a
// field lock: field access is per-field and would need a ticket count per
// render, while `readOnly` would also refuse the harmless case (correcting a
// typo on an evening nobody has bought into). So the rule is asked once, in a
// `beforeChange` hook, over the two snapshots Payload already has:
//
//     a PUBLIC row + a moved date or time + at least one active ticket = refuse
//
// It runs for every writer of the collection — the admin form, the REST API,
// GraphQL, the local API — and cannot be bypassed by loosening field access.
// The three loud routes are outside it by construction, not by an exemption:
// all three write with raw SQL, so no collection hook fires for them.
//
// Everything here is pure and takes its one fact (the ticket count) as a
// dependency, so the rule is unit-tested without a database; `Shows.ts` is only
// the wiring.

import { isPublicPerformance } from '@/lib/show-performance'
import { toIsoDate } from '@/lib/to-iso-date'

/** A Shows row or a patch of one, as Payload hands it to a collection hook. */
export type ScheduleRow = Record<string, unknown> | null | undefined

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
 * The day is compared **in Zagreb**, not in UTC, and that is the load-bearing
 * choice here rather than a flourish. A save of a sold evening that changes only
 * the note still re-posts the whole document, and the `dayOnly` picker is free to
 * hand back the same day as a local midnight (`2026-09-30T22:00:00Z` for 1
 * October) — in UTC that reads as a different day, which would refuse every
 * ordinary save on a selling show. Shows are stored at **noon UTC**, which is
 * mid-afternoon in Zagreb, so no re-serialisation of an untouched value can cross
 * a Zagreb midnight, while a real move is a whole day and crosses it in any zone.
 * It is also the more honest question: the day an evening IS, is the day the house
 * is in.
 *
 * A key the patch does not carry is a field this save does not touch, so it
 * never counts as moved. That is what keeps the ordinary save — a note, a
 * threshold, a sold counter ticking on a sale — outside the rule entirely.
 */
export function scheduleMove(original: ScheduleRow, patch: ScheduleRow): ScheduleHalf[] {
  const before = original ?? {}
  const after = patch ?? {}
  const moved: ScheduleHalf[] = []
  if ('date' in after && dayOf(after.date) !== dayOf(before.date)) moved.push('date')
  if ('time' in after && timeOf(after.time) !== timeOf(before.time)) moved.push('time')
  return moved
}

const ZAGREB_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zagreb',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The Zagreb calendar day of whatever shape the column arrived in. */
function dayOf(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value))
  // An unparseable value is compared as itself rather than collapsed to '',
  // which would read as "the day was cleared" and refuse a save over nothing.
  return Number.isNaN(ms) ? toIsoDate(value) || String(value) : ZAGREB_DAY.format(ms)
}

function timeOf(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * The refusal, naming the half that moved and the action that would have told
 * the buyers.
 *
 * English, like the rest of this form's own copy (the field validators, the
 * `admin.description` lines): the Backoffice is developer-facing, and the
 * action it names — *Move show date/time & notify buyers* — is the label of the
 * edit-menu item sitting on the very same screen. Cecilija's sibling refusal is
 * Croatian and names *Pomakni termin*, because that is what its reader sees
 * (`APP_STRINGS.performance.timeLocked`).
 */
export function scheduleLockMessage(moved: readonly ScheduleHalf[]): string {
  const what =
    moved.length > 1 ? 'date and start time' : moved[0] === 'time' ? 'start time' : 'date'
  return (
    `This show has sold tickets, so its ${what} cannot be changed on this form: ` +
    'it would move the evening and tell nobody. Use "Move show date/time & notify buyers" ' +
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
