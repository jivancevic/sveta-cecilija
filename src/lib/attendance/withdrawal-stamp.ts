// Odustajanje: the three stamps an attendance row carries, and the rule that
// moves them (#612). Glossary: CONTEXT.md → *Odustajanje*.
//
// `attendance` holds ONE row per (performance, member) and the answer route
// upserts it, so the previous answer is unrecoverable the moment the next one
// lands (`./answer.ts`). That is fine for "is this person coming" and useless
// for the question a voditelj actually asks the night before: who did I have
// and then lose. These stamps answer exactly that much and nothing more — no
// log, no history, no reliability file.
//
//   confirmedAt  when the row most recently ENTERED `coming`. It does NOT move
//                while the answer stays `coming`, which is the whole point: the
//                grace window measures how long the promise STOOD, not how long
//                ago the dancer last touched their phone.
//   withdrewAt   when a standing `coming` was taken back.
//   withdrewOwn  whether the dancer did it, or a voditelj wrote it down.
//
// The ten minutes are a mis-tap filter, not a policy about lateness. Dolazim and
// Ne dolazim sit next to each other on a phone card; a dancer who hits the wrong
// one and fixes it three seconds later has withdrawn nothing, and a list that
// said otherwise would be wrong in the direction that matters — it would send
// somebody chasing a dancer who is coming.
//
// Pure, with `nowMs` injected, so every branch is tested without a clock or a
// database. The route is the only caller.

import type { AttendanceStatus } from './rules'

/**
 * How long a `dolazim` must stand before taking it back counts as odustajanje.
 *
 * Ten minutes, chosen by the voditelji: long enough that a fat finger never
 * appears on the list, short enough that a dancer who answers at the start of
 * rehearsal and backs out at the end of it does.
 */
export const WITHDRAWAL_GRACE_MS = 10 * 60 * 1000

/** The stamps as they stand on the row before this write. */
export interface WithdrawalStamps {
  /** ISO, or null on a row that has never been `coming`. */
  confirmedAt: string | null
  /** ISO, or null on a row that has never taken a standing `coming` back. */
  withdrewAt: string | null
  /**
   * Did the DANCER take it back, or did a voditelj write it down for them?
   *
   * Null wherever `withdrewAt` is null. It is stamped here rather than looked
   * up later because the fact is free at write time and expensive afterwards:
   * the row stores `answeredBy` as a user id, and turning that back into "was
   * this the dancer's own login" needs the `Users.member` link, which is
   * field-locked and would cost the screen an extra query per evening.
   *
   * It is not attribution for its own sake. A dancer who withdraws at 19:40 has
   * gone quiet; one a voditelj wrote down at 19:40 phoned somebody. Those are
   * different evenings.
   */
  withdrewOwn: boolean | null
}

export interface StampInput extends WithdrawalStamps {
  /** The answer that stands before this write; null when there is no row yet. */
  previousStatus: AttendanceStatus | null
  /** The answer being written. `clear` deletes the row and never gets here. */
  nextStatus: AttendanceStatus
  /** True when the caller is answering for their OWN Member row. */
  ownAnswer: boolean
  nowMs: number
}

function msOf(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * The stamps as they should stand AFTER this write.
 *
 * Four cases, and the two boring ones carry the subtlety:
 *
 *   → coming, already coming     nothing moves. Re-answering the same thing
 *                                (an army move, a second tap) must not restart
 *                                the grace window, or a dancer could keep a
 *                                withdrawal off the list by tapping Dolazim
 *                                again first.
 *   → coming, anything else      the promise starts now, and any earlier
 *                                withdrawal is forgotten: coming back clears
 *                                the trace (this is deliberate, see the header).
 *   → not_coming, was coming     withdrawal IF the promise stood long enough;
 *                                otherwise a mis-tap and nothing is recorded.
 *   → not_coming, was not coming the row is unchanged, INCLUDING an earlier
 *                                withdrawal. Recomputing here would read "was
 *                                not coming" as "never promised" and quietly
 *                                erase the very thing Stanje is showing.
 */
export function stampWithdrawal(input: StampInput): WithdrawalStamps {
  const now = new Date(input.nowMs).toISOString()

  if (input.nextStatus === 'coming') {
    return {
      confirmedAt: input.previousStatus === 'coming' ? input.confirmedAt : now,
      withdrewAt: null,
      withdrewOwn: null,
    }
  }

  if (input.previousStatus !== 'coming') {
    return {
      confirmedAt: input.confirmedAt,
      withdrewAt: input.withdrewAt,
      withdrewOwn: input.withdrewOwn,
    }
  }

  const stoodSince = msOf(input.confirmedAt)
  // A row that was `coming` with no `confirmedAt` predates this migration. It
  // is treated as a mis-tap rather than a withdrawal: guessing the promise was
  // old enough would put people on the list with a made-up time, and the
  // backfill-free start is a stated property of the feature.
  const stood = stoodSince == null ? -1 : input.nowMs - stoodSince

  const withdrew = stood >= WITHDRAWAL_GRACE_MS

  return {
    confirmedAt: input.confirmedAt,
    withdrewAt: withdrew ? now : null,
    withdrewOwn: withdrew ? input.ownAnswer : null,
  }
}

/**
 * What "poništi moj odgovor" does to a row (#624).
 *
 * The two-circle control on Moreška lets a dancer un-tap the answer they gave,
 * and that gesture cannot be a plain delete. A standing `dolazim` that somebody
 * has been counting on is not un-said by pressing a button again: taking it
 * back IS the odustajanje this file exists for, and a delete would erase the
 * one thing the voditelj's list is built out of. So the grace window decides,
 * exactly as it does for a Ne dolazim:
 *
 *   never promised, or promised within the last ten minutes → delete the row,
 *     and the dancer is back to having said nothing.
 *   a promise that STOOD → the row becomes `ne dolazim` carrying the
 *     withdrawal stamps, and the dancer's screen fills the red circle, which is
 *     the truth about where they now stand.
 *
 * `undo` is therefore NOT `clear`, and the two must not be merged. `clear` is
 * the voditelj's "obriši odgovor" on the person sheet (#612, Q2): a correction
 * of the RECORD, saying this answer was never given, and it deletes
 * unconditionally. `undo` is an act BY the person, and an act leaves a trace.
 *
 * The grace rule itself is not restated here: this asks `stampWithdrawal` what
 * the move from `coming` to `not_coming` would stamp, and a row it declines to
 * mark is by definition a mis-tap.
 */
export type UndoOutcome =
  | { op: 'delete' }
  | { op: 'withdraw'; stamps: WithdrawalStamps }

export function resolveUndo(input: {
  /** The answer standing before this write; null when there is no row. */
  previousStatus: AttendanceStatus | null
  ownAnswer: boolean
  nowMs: number
  stamps: WithdrawalStamps
}): UndoOutcome {
  if (input.previousStatus !== 'coming') return { op: 'delete' }

  const stamps = stampWithdrawal({
    ...input.stamps,
    previousStatus: 'coming',
    nextStatus: 'not_coming',
    ownAnswer: input.ownAnswer,
    nowMs: input.nowMs,
  })

  return stamps.withdrewAt ? { op: 'withdraw', stamps } : { op: 'delete' }
}
