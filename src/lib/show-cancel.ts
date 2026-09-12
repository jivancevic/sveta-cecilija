// Pure orchestration for "cancel a public performance, refund and notify every
// buyer" (#497). Sibling of show-reschedule.ts: the route wires the real DB +
// Stripe + Brevo, this stays DI + testable.
//
// Until #497 cancelling was a bare `PATCH /api/shows/<id> {status:'cancelled'}`:
// the show vanished from /tickets and nothing else happened. Every ticket stayed
// active, no buyer heard, no money moved, and the secretary was left to find and
// refund each order by hand. Rescheduling already had the honest flow; this is
// the same standard for the harsher action.
//
// Order of operations, and why:
//   1. CLAIM the cancellation first (atomic UPDATE … WHERE status <> 'cancelled')
//      so the show stops selling before a single refund runs. Losing the claim
//      is NOT a reason to stop: a half-finished earlier run leaves the row
//      already cancelled, and the whole point is that pressing the button again
//      finishes the job.
//   2. MONEY per order — an online order refunds through the idempotent engine
//      (`refund:<paymentIntentId>`, which also voids its tickets); a partner or
//      comp order is voided as a storno so its seats leave the show and, for a
//      partner, the monthly statement.
//   3. MAIL per order — one message to every order with an address on file that
//      has not been notified yet.
//
// RE-RUNNABILITY is the design constraint, not a nicety: a Brevo hiccup or a
// Stripe timeout partway through 300 orders must be fixable by pressing the
// button again, never by hand-reconciling money. Each step therefore carries its
// own durable record of "done" — `refund_status` for the money, `tickets.status`
// for the seats, `cancel_notified_at` for the mail — and each step is skipped
// when its record says so. Nothing here is transactional across orders; a
// failure is counted, recorded in critical_events, and the loop moves on.
//
// This notice is TRANSACTIONAL, not marketing: it concerns a ticket the buyer
// already holds, so like the reschedule and venue-change notices it deliberately
// ignores the marketing_optouts list (#57).

import type { Venue } from './venues'
import { assertPublicPerformance } from './show-admin-actions'

export type CancelChannel = 'online' | 'partner' | 'comp'

/**
 * What the buyer of one order is told about their money.
 *
 * - `refund` — we moved it: an online order refunded to the original payment
 *   method in this run, or already refunded before it.
 * - `point-of-sale` — a partner sold and charged it, so the refund is theirs to
 *   make; the notice sends the buyer back to the desk they bought at.
 * - `none` — a comp: the seat was free, there is nothing to return.
 */
export type RefundMode = 'refund' | 'point-of-sale' | 'none'

export interface CancelShowRow {
  id: string
  /** Scheduled date, YYYY-MM-DD. */
  date: string
  time: string
  venue: Venue
  /**
   * #409 — absent on pre-phase-2 rows, which are public by definition. A
   * non-public performance has no buyers and no tickets, so this action refuses
   * it; cancel one of those by setting the status field by hand.
   */
  isPublic?: boolean | null
  /** True when the row is already `status='cancelled'` (an earlier, possibly half-finished run). */
  cancelled: boolean
}

export interface CancelOrderRow {
  orderId: string
  channel: CancelChannel
  buyerName: string
  /** NULL on an unclaimed partner slip or an anonymous comp — nobody to write to. */
  email: string | null
  locale: 'en' | 'hr' | null
  /** EUR cents. 0 on a comp. */
  totalCents: number
  /** Seats on this order (adult + child), for the preview's statement line. */
  seats: number
  /** `refund_status = 'refunded'` as read now: the money half is already done. */
  refunded: boolean
  /** `cancel_notified_at IS NOT NULL`: the mail half is already done. */
  notified: boolean
}

export interface CancelShowInput {
  showId: string
  userId: string
}

export interface CancelShowDeps {
  getShow: (showId: string) => Promise<CancelShowRow | null>
  /** Every order of the show, any channel, refunded or not. */
  findOrders: (showId: string) => Promise<CancelOrderRow[]>
  /** Atomic flip to `status='cancelled'`. True only if THIS call flipped it. */
  claimCancel: (showId: string, userId: string) => Promise<boolean>
  /**
   * Full refund of one online order through the shared idempotent engine
   * (`src/lib/refund/`), which also voids the order's tickets. Returns
   * `refunded:false` when the order was already refunded (the engine re-voids
   * any stuck tickets in that case). Throws on a Stripe or DB failure.
   */
  refundOnlineOrder: (orderId: string) => Promise<{ refunded: boolean; amountCents: number }>
  /** Void the order's still-active tickets as a storno. Idempotent; returns how many were newly voided. */
  voidTickets: (orderId: string) => Promise<number>
  /** Best-effort send; true on success, false on failure (already logged). */
  sendCancellationEmail: (
    order: CancelOrderRow,
    show: { date: string; time: string; venue: Venue },
    mode: RefundMode,
  ) => Promise<boolean>
  /** Stamp `cancel_notified_at` so a re-run leaves this buyer alone. */
  markNotified: (orderId: string) => Promise<void>
  /** Durable record of a failure a human has to chase (critical_events). Never throws. */
  recordFailure: (kind: string, context: Record<string, unknown>) => Promise<void>
}

export interface CancelShowResult {
  status: 'cancelled' | 'already-cancelled'
  date: string
  /** Orders looked at, every channel. */
  orders: number
  /** Online orders refunded by THIS run (an already-refunded order is not counted again). */
  refunded: number
  refundedCents: number
  /** Online orders whose refund threw; the money did NOT move, press the button again. */
  refundFailed: number
  /** Tickets voided by this run on partner + comp orders (the refund engine voids its own). */
  voided: number
  /** Buyers mailed by this run. */
  notified: number
  /** Sends that failed; `cancel_notified_at` stays NULL so a re-run retries exactly these. */
  notifyFailed: number
  /** Orders with no address on file (unclaimed partner slips, anonymous comps). */
  noEmail: number
}

/** What each channel's buyer is told about the money. */
export function refundModeFor(channel: CancelChannel): RefundMode {
  if (channel === 'online') return 'refund'
  if (channel === 'partner') return 'point-of-sale'
  return 'none'
}

export async function cancelShow(
  input: CancelShowInput,
  deps: CancelShowDeps,
): Promise<CancelShowResult> {
  const show = await deps.getShow(input.showId)
  if (!show) throw new Error('Show not found')
  assertPublicPerformance(show as unknown as Record<string, unknown>)

  // Stop the sales first, then move money. A lost claim means an earlier run
  // already cancelled the row — we still walk every order, because that earlier
  // run is exactly the one that may have died halfway.
  const claimed = await deps.claimCancel(input.showId, input.userId)

  const orders = await deps.findOrders(input.showId)
  const result: CancelShowResult = {
    status: claimed ? 'cancelled' : 'already-cancelled',
    date: show.date,
    orders: orders.length,
    refunded: 0,
    refundedCents: 0,
    refundFailed: 0,
    voided: 0,
    notified: 0,
    notifyFailed: 0,
    noEmail: 0,
  }

  for (const order of orders) {
    // --- money / seats -------------------------------------------------
    // Wrapped per order: one buyer's card failing must never abandon the other
    // 299, and it must not turn an already-cancelled show into a 4xx either.
    let moneyOk = true
    if (order.channel === 'online') {
      try {
        const refund = await deps.refundOnlineOrder(order.orderId)
        if (refund.refunded) {
          result.refunded++
          result.refundedCents += refund.amountCents
        }
      } catch (err) {
        moneyOk = false
        result.refundFailed++
        const message = err instanceof Error ? err.message : String(err)
        console.error(
          `[cancelShow] refund failed showId=${input.showId} orderId=${order.orderId} error=${message}`,
        )
        await deps.recordFailure('show_cancel_refund_failed', {
          showId: input.showId,
          orderId: order.orderId,
          amountCents: order.totalCents,
          error: message,
        })
      }
    } else {
      // Partner + comp: no money to move, but the seats must leave the show (and
      // a partner's seats must leave the monthly statement), so void as storno.
      try {
        result.voided += await deps.voidTickets(order.orderId)
      } catch (err) {
        moneyOk = false
        const message = err instanceof Error ? err.message : String(err)
        console.error(
          `[cancelShow] void failed showId=${input.showId} orderId=${order.orderId} error=${message}`,
        )
        await deps.recordFailure('show_cancel_void_failed', {
          showId: input.showId,
          orderId: order.orderId,
          channel: order.channel,
          error: message,
        })
      }
    }

    // --- mail ----------------------------------------------------------
    if (!order.email) {
      result.noEmail++
      continue
    }
    if (order.notified) continue
    // Never promise a refund we just failed to make: an online order whose
    // Stripe call threw waits for the retry, and the buyer hears nothing until
    // the money is actually on its way back.
    if (!moneyOk) continue

    let sent = false
    try {
      sent = await deps.sendCancellationEmail(
        order,
        { date: show.date, time: show.time, venue: show.venue },
        refundModeFor(order.channel),
      )
    } catch (err) {
      console.error(
        `[cancelShow] sendCancellationEmail threw showId=${input.showId} orderId=${order.orderId} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      sent = false
    }

    if (!sent) {
      result.notifyFailed++
      await deps.recordFailure('show_cancel_email_failed', {
        showId: input.showId,
        orderId: order.orderId,
        email: order.email,
      })
      continue
    }

    // Stamp only after a confirmed send, so a failed stamp is the one error that
    // can double-mail a buyer on a re-run — strictly better than losing the
    // notice entirely, which is what stamping first would risk.
    result.notified++
    try {
      await deps.markNotified(order.orderId)
    } catch (err) {
      console.error(
        `[cancelShow] markNotified failed showId=${input.showId} orderId=${order.orderId} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      await deps.recordFailure('show_cancel_stamp_failed', {
        showId: input.showId,
        orderId: order.orderId,
      })
    }
  }

  return result
}

/**
 * Brevo's free tier sends 300 mails a day. A sold-out Ljetno kino is ~42 online
 * orders on the season average and ~300 in the worst case, so the preview warns
 * rather than the route queueing (no queue in v1, #497). We cannot see how much
 * of today's quota is already spent, so the warning is about the day's ceiling,
 * and the modal copy says so.
 */
export const BREVO_DAILY_MAIL_LIMIT = 300

export interface PreviewCancelResult {
  /** The row is already cancelled: this would be a re-run that finishes the job. */
  alreadyCancelled: boolean
  date: string
  time: string
  /** Online orders still holding money, and what it adds up to. */
  onlineOrders: number
  refundCents: number
  /** Partner orders and the seats that leave the monthly statement. */
  partnerOrders: number
  partnerSeats: number
  compOrders: number
  compSeats: number
  /** Orders that will be mailed by a run now (address on file, not yet notified). */
  toNotify: number
  /** Orders with no address: unclaimed partner slips and anonymous comps. */
  noEmail: number
  sampleEmails: string[]
  /** True when the sends alone could exhaust a day's Brevo quota. */
  overDailyMailLimit: boolean
  dailyMailLimit: number
}

export async function previewCancel(
  showId: string,
  deps: Pick<CancelShowDeps, 'getShow' | 'findOrders'>,
): Promise<PreviewCancelResult> {
  const show = await deps.getShow(showId)
  if (!show) throw new Error('Show not found')
  assertPublicPerformance(show as unknown as Record<string, unknown>)
  const orders = await deps.findOrders(showId)

  const online = orders.filter((o) => o.channel === 'online' && !o.refunded)
  const partner = orders.filter((o) => o.channel === 'partner')
  const comp = orders.filter((o) => o.channel === 'comp')
  const toNotify = orders.filter((o) => o.email && !o.notified)

  return {
    alreadyCancelled: show.cancelled,
    date: show.date,
    time: show.time,
    onlineOrders: online.length,
    refundCents: online.reduce((sum, o) => sum + o.totalCents, 0),
    partnerOrders: partner.length,
    partnerSeats: partner.reduce((sum, o) => sum + o.seats, 0),
    compOrders: comp.length,
    compSeats: comp.reduce((sum, o) => sum + o.seats, 0),
    toNotify: toNotify.length,
    noEmail: orders.filter((o) => !o.email).length,
    sampleEmails: toNotify.slice(0, 5).map((o) => String(o.email)),
    overDailyMailLimit: toNotify.length > BREVO_DAILY_MAIL_LIMIT,
    dailyMailLimit: BREVO_DAILY_MAIL_LIMIT,
  }
}
