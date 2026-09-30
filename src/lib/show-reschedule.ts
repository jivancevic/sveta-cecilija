// Pure orchestration for the "move a show and notify buyers" staff action.
// Sibling of venue-change.ts (#94); the route wires the real DB + Brevo, this
// stays DI + testable.
//
// #688 — it moves the DATE, the START TIME, or both. It was the date alone
// until 2026-09-28, when the uprava moved an evening from 17:00 to 18:00 by
// writing `shows.time` and the buyers were told nothing: the hour is as
// material to somebody holding a ticket as the day is, and since #674 a wrong
// hour also makes the entrance time printed on their PDF wrong by the same
// amount. One path, one notice, one reissue — a second mechanism for the clock
// is exactly what this ticket exists to avoid.
//
// Idempotency / race-safety lives in deps.claimReschedule: an atomic
//   UPDATE shows SET date=$newDate, time=$newTime, date_changed_at=NOW(),
//          date_changed_by_id=$user, original_date=<the first date, if the day moved>,
//          updated_at=NOW()
//   WHERE id=$show AND date::date=$expectedOldDate AND time=$expectedOldTime
//   RETURNING id
// Claim FIRST (optimistic concurrency on the schedule as this caller read it),
// then send mail — so two concurrent confirmations can never double-notify
// buyers. The loser's expected pair no longer matches → claims nothing →
// `schedule-mismatch`, no mail. The TIME is in that guard for the same reason
// the date always was: without it, two people moving the hour at once would
// both win and both mail. Unlike the venue move this is NOT a one-shot flag, so
// a show can be moved more than once (original_date keeps the very first date).
//
// This notice is TRANSACTIONAL, not marketing: it concerns a ticket the buyer
// already holds and a material change to it, so it deliberately does NOT honour
// the marketing_optouts list (#57), exactly like the venue-change notice.
//
// #379 — the notice alone is not enough. It says "your tickets are automatically
// valid", which is true of the QR token but NOT of the artefact the buyer holds:
// their original ticket email keeps its old subject and its PDF keeps the old
// date and the old hour. A buyer who misses one email keeps re-reading a
// document that confidently states the wrong time (this cost us a no-show, a
// chargeback and a 1-star review on 2026-08-20). So after the notice we REISSUE
// the ticket itself — a second message, per ORDER, carrying a regenerated PDF +
// ICS built from the now-updated show row. It reuses the existing ticket rows,
// so the QR tokens are unchanged and a buyer already holding the old PDF still
// scans VALID. Both sends are best-effort: the move is already claimed and
// committed, so a mail failure is counted and logged, never a rollback.

import type { Venue } from './venues'
import { assertPublicPerformance } from './show-admin-actions'

/**
 * The Backoffice edit-menu item that moves a schedule and tells the buyers.
 *
 * One spelling, in the module the button and the #689 refusal both already
 * import: the button renders it, and the refusal on the quiet path names it back
 * so the editor is pointed at a control they can see on the same screen. It
 * lives HERE rather than in `show-schedule-lock.ts` because that module is the
 * decision and this one is the action — and because `RescheduleShowMenuItem` is
 * a client component that imports this file anyway, so the label costs its
 * bundle nothing.
 */
export const RESCHEDULE_ACTION_LABEL = 'Move show date/time & notify buyers'

export interface RescheduleShow {
  id: string
  /** Current scheduled date, YYYY-MM-DD. */
  date: string
  /** Current start time, HH:MM. */
  time: string
  /** Venue slug — stated in the notice so a forgetful buyer knows where to go (unchanged by a move). */
  venue: Venue
  /**
   * #409 — absent on pre-phase-2 rows, which are public by definition. A
   * non-public performance has no buyers to notify and no tickets to reissue,
   * so the action refuses rather than moving the schedule silently.
   */
  isPublic?: boolean | null
}

export interface RescheduleBuyer {
  orderId: string
  name: string
  email: string
  locale: 'en' | 'hr' | null
}

/** A whole schedule: the day and the hour, never one without the other. */
export interface ScheduleTarget {
  date: string
  time: string
}

export interface RescheduleInput {
  showId: string
  userId: string
  /** Target date, YYYY-MM-DD. Omitted keeps the current day. */
  newDate?: string
  /** Target start time, HH:MM. Omitted keeps the current hour. */
  newTime?: string
}

export interface RescheduleDeps {
  getShow: (showId: string) => Promise<RescheduleShow | null>
  findBuyers: (showId: string) => Promise<RescheduleBuyer[]>
  /**
   * Atomic claim guarded on the schedule as this caller read it. True only if
   * this call moved it. `next` always carries BOTH halves resolved, so the
   * writer never has to work out which one the caller typed.
   */
  claimReschedule: (
    showId: string,
    userId: string,
    expected: ScheduleTarget,
    next: ScheduleTarget,
  ) => Promise<boolean>
  /** Best-effort send; returns true on success, false on failure (logged). */
  sendScheduleChangeEmail: (
    buyer: RescheduleBuyer,
    show: { oldDate: string; newDate: string; oldTime: string; newTime: string; venue: Venue },
  ) => Promise<boolean>
  /**
   * Every order on this show that should get its ticket reissued — one entry per
   * ORDER, not per buyer (the notice is deduped by email; a ticket is not, since
   * each order carries its own QR codes and its own PDF).
   */
  findReissueOrderIds: (showId: string) => Promise<string[]>
  /**
   * Best-effort ticket reissue for one order: regenerates the ticket email + PDF
   * + ICS from the *current* show row (already moved by claimReschedule) and
   * sends it. MUST NOT mint new ticket rows or tokens — it re-renders the
   * existing ones, so the QR the buyer already has keeps scanning.
   * Returns true on success, false on failure (logged).
   */
  reissueTicket: (orderId: string) => Promise<boolean>
}

export type RescheduleResult =
  | {
      status: 'rescheduled'
      oldDate: string
      newDate: string
      oldTime: string
      newTime: string
      total: number
      sent: number
      failed: number
      /** Orders whose ticket email + PDF + ICS were re-sent with the new schedule. */
      reissued: number
      /** Orders whose reissue failed — the move still stands (#379). */
      reissueFailed: number
    }
  | { status: 'no-op'; date: string; time: string }
  | { status: 'schedule-mismatch' }

export async function rescheduleShow(
  input: RescheduleInput,
  deps: RescheduleDeps,
): Promise<RescheduleResult> {
  const show = await deps.getShow(input.showId)
  if (!show) throw new Error('Show not found')
  assertPublicPerformance(show as unknown as Record<string, unknown>)

  // An omitted half means "leave it alone", so both halves are resolved once,
  // here, and everything downstream — the claim, the notice, the audit — reads a
  // whole schedule rather than a patch with a hole in it.
  const expected: ScheduleTarget = { date: show.date, time: show.time }
  const next: ScheduleTarget = {
    date: input.newDate ?? show.date,
    time: input.newTime ?? show.time,
  }

  if (next.date === expected.date && next.time === expected.time) {
    // Already there — nothing to change, nobody to notify.
    return { status: 'no-op', date: show.date, time: show.time }
  }

  const claimed = await deps.claimReschedule(input.showId, input.userId, expected, next)
  if (!claimed) {
    // Lost the optimistic claim (a concurrent confirm already moved it).
    return { status: 'schedule-mismatch' }
  }

  const buyers = await deps.findBuyers(input.showId)
  let sent = 0
  let failed = 0
  for (const buyer of buyers) {
    const ok = await deps.sendScheduleChangeEmail(buyer, {
      oldDate: expected.date,
      newDate: next.date,
      oldTime: expected.time,
      newTime: next.time,
      venue: show.venue,
    })
    if (ok) sent++
    else failed++
  }

  // Reissue AFTER the notice so the ticket is the newest ticket-shaped thing in
  // the inbox: the buyer reads why the evening moved, then finds a correct
  // ticket sitting on top of it. Wrapped per order — a reissue that throws must
  // not abort the loop, lose the other buyers' tickets, or turn an
  // already-committed move into a 4xx for the admin.
  let reissued = 0
  let reissueFailed = 0
  const reissueOrderIds = await deps.findReissueOrderIds(input.showId).catch((err) => {
    console.error(
      `[rescheduleShow] findReissueOrderIds failed showId=${input.showId} error=${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return [] as string[]
  })
  for (const orderId of reissueOrderIds) {
    let ok = false
    try {
      ok = await deps.reissueTicket(orderId)
    } catch (err) {
      console.error(
        `[rescheduleShow] reissueTicket threw showId=${input.showId} orderId=${orderId} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      ok = false
    }
    if (ok) reissued++
    else reissueFailed++
  }

  return {
    status: 'rescheduled',
    oldDate: expected.date,
    newDate: next.date,
    oldTime: expected.time,
    newTime: next.time,
    total: buyers.length,
    sent,
    failed,
    reissued,
    reissueFailed,
  }
}

export interface PreviewRescheduleResult {
  currentDate: string
  time: string
  buyerCount: number
  sampleEmails: string[]
}

export async function previewReschedule(
  showId: string,
  deps: Pick<RescheduleDeps, 'getShow' | 'findBuyers'>,
): Promise<PreviewRescheduleResult> {
  const show = await deps.getShow(showId)
  if (!show) throw new Error('Show not found')
  assertPublicPerformance(show as unknown as Record<string, unknown>)
  const buyers = await deps.findBuyers(showId)
  return {
    currentDate: show.date,
    time: show.time,
    buyerCount: buyers.length,
    sampleEmails: buyers.slice(0, 5).map((b) => b.email),
  }
}
