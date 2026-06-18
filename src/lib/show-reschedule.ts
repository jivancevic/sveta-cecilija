// Pure orchestration for the "reschedule a show to a new date + notify buyers"
// admin action. Sibling of venue-change.ts (#94); the route wires the real DB +
// Brevo, this stays DI + testable.
//
// Idempotency / race-safety lives in deps.claimReschedule: an atomic
//   UPDATE shows SET date=$newDate, date_changed_at=NOW(),
//          date_changed_by_id=$user, original_date=COALESCE(original_date,date),
//          updated_at=NOW()
//   WHERE id=$show AND date::date=$expectedOldDate
//   RETURNING id
// Claim FIRST (optimistic concurrency on the old date), then send mail — so two
// concurrent confirmations can never double-notify buyers. The loser's
// expectedOldDate no longer matches → claims nothing → `date-mismatch`, no mail.
// Unlike the venue move this is NOT a one-shot flag, so a show can be
// rescheduled more than once (original_date keeps the very first date).
//
// This notice is TRANSACTIONAL, not marketing: it concerns a ticket the buyer
// already holds and a material change to it, so it deliberately does NOT honour
// the marketing_optouts list (#57), exactly like the venue-change notice.

import type { Venue } from './venues'

export interface RescheduleShow {
  id: string
  /** Current scheduled date, YYYY-MM-DD. */
  date: string
  time: string
  /** Venue slug — stated in the notice so a forgetful buyer knows where to go (unchanged by a reschedule). */
  venue: Venue
}

export interface RescheduleBuyer {
  orderId: string
  name: string
  email: string
  locale: 'en' | 'hr' | null
}

export interface RescheduleInput {
  showId: string
  userId: string
  /** Target date, YYYY-MM-DD. */
  newDate: string
}

export interface RescheduleDeps {
  getShow: (showId: string) => Promise<RescheduleShow | null>
  findBuyers: (showId: string) => Promise<RescheduleBuyer[]>
  /** Atomic claim guarded on the expected old date. True only if this call moved it. */
  claimReschedule: (
    showId: string,
    userId: string,
    expectedOldDate: string,
    newDate: string,
  ) => Promise<boolean>
  /** Best-effort send; returns true on success, false on failure (logged). */
  sendDateChangeEmail: (
    buyer: RescheduleBuyer,
    show: { oldDate: string; newDate: string; time: string; venue: Venue },
  ) => Promise<boolean>
}

export type RescheduleResult =
  | { status: 'rescheduled'; oldDate: string; newDate: string; total: number; sent: number; failed: number }
  | { status: 'no-op'; date: string }
  | { status: 'date-mismatch' }

export async function rescheduleShow(
  input: RescheduleInput,
  deps: RescheduleDeps,
): Promise<RescheduleResult> {
  const show = await deps.getShow(input.showId)
  if (!show) throw new Error('Show not found')

  if (input.newDate === show.date) {
    // Already on the target date — nothing to change, nobody to notify.
    return { status: 'no-op', date: show.date }
  }

  const claimed = await deps.claimReschedule(input.showId, input.userId, show.date, input.newDate)
  if (!claimed) {
    // Lost the optimistic claim (a concurrent confirm already moved it).
    return { status: 'date-mismatch' }
  }

  const buyers = await deps.findBuyers(input.showId)
  let sent = 0
  let failed = 0
  for (const buyer of buyers) {
    const ok = await deps.sendDateChangeEmail(buyer, {
      oldDate: show.date,
      newDate: input.newDate,
      time: show.time,
      venue: show.venue,
    })
    if (ok) sent++
    else failed++
  }

  return { status: 'rescheduled', oldDate: show.date, newDate: input.newDate, total: buyers.length, sent, failed }
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
  const buyers = await deps.findBuyers(showId)
  return {
    currentDate: show.date,
    time: show.time,
    buyerCount: buyers.length,
    sampleEmails: buyers.slice(0, 5).map((b) => b.email),
  }
}
