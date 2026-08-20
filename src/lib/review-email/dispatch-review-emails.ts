// Pure orchestration for the post-show review email (sent T+1.5h after the show).
//
// Eligibility (all required):
//   1. Show date+time falls inside the send window: at least 1.5h ago, and no
//      more than REVIEW_WINDOW_DAYS ago (see below)
//   2. order.review_email_sent_at IS NULL
//   3. order has at least one ticket (adult_count + child_count > 0)
//   4. order.refund_status != 'refunded'
//   5. buyer email is not in marketing_optouts — pre-filtered in the caller's
//      SQL; authoritatively gated in sendReviewEmail (src/lib/marketing/opt-out)
//   6. the party actually turned up: at least one active ticket on the order is
//      scanned (#378). The predicate is evaluated in the caller's SQL and
//      arrives as `attended`; the skip itself happens *here*, before claimOrder,
//      so a no-show is counted in the run result and left unclaimed
//      (review_email_sent_at stays NULL) — a late scan correction still sends.
//
// Why the window has a FLOOR and not just a ceiling: because a no-show is never
// claimed, it stays review_email_sent_at IS NULL forever. With only a ceiling
// every no-show the season has ever produced is re-selected on every run, so
// `skippedNoShow` reports an all-time backlog instead of the per-run sold-vs-
// scanned gap it exists to show, and a stray late scan months later would fire
// "how was the show?" for a long-past performance. REVIEW_WINDOW_DAYS bounds
// both: a scan correction still lands for a week, which is far longer than the
// same-night door corrections it needs to tolerate, and after that the order is
// left alone for good.
//
// Why gate on tickets.scanned rather than the weaker "order still has active
// tickets": on show 14, 186 of 206 active tickets were scanned and no order was
// *partially* scanned (six orders scanned 0%, every other order 100%). Door
// scanning is therefore reliable at whole-party granularity, so a scanned gate
// cannot silently suppress a buyer who did attend. The failure mode it does
// carry — staff waving a group through unscanned costs that buyer their review
// ask — is the cheap direction to fail; asking a no-show to review a show they
// missed reads as a brush-off and has already produced a payment dispute and a
// 1-star review (#378).
//
// Idempotency contract: deps.claimOrder MUST do an atomic
// `UPDATE orders SET review_email_sent_at = NOW()
//    WHERE id = $1 AND review_email_sent_at IS NULL RETURNING id`
// and return null if no row was claimed. That guarantees at-most-once send
// even under concurrent cron invocations.

export interface EligibleOrder {
  id: string
  buyerName: string
  email: string
  locale: 'en' | 'hr' | null
  /** True when the order has >= 1 active ticket that was scanned at the door. */
  attended: boolean
}

export interface DispatchInput {
  /** Reference "now" — usually `new Date()`, parameterised for tests. */
  now: Date
}

/** Half-open send window for a run: show start must fall in [from, to]. */
export interface SendWindow {
  /** Floor — REVIEW_WINDOW_DAYS before `now`. Keeps old no-shows out. */
  from: Date
  /** Ceiling — 1.5h before `now`. The show must have finished. */
  to: Date
}

export interface DispatchDeps {
  /**
   * Returns every order whose show's local date+time falls inside `window` AND
   * is not already marked sent AND has tickets AND is not refunded AND whose
   * buyer email is not opted out, each carrying its `attended` flag. Show
   * date+time is treated as Europe/Zagreb wall clock and converted by the
   * caller's SQL (see route).
   */
  findEligibleOrders: (window: SendWindow) => Promise<EligibleOrder[]>
  /**
   * Atomic claim. Returns true if this caller claimed the row (proceed to
   * send); false if another worker already claimed it.
   */
  claimOrder: (orderId: string) => Promise<boolean>
  /** Best-effort: log + swallow errors inside. */
  sendEmail: (order: EligibleOrder) => Promise<void>
  /** Compensating action if the email send fails — un-mark so cron retries. */
  releaseClaim: (orderId: string) => Promise<void>
}

export interface DispatchResult {
  considered: number
  sent: number
  skippedAlreadyClaimed: number
  /**
   * Orders inside the send window with no scanned active ticket. Bounded by
   * REVIEW_WINDOW_DAYS, so this is the recent sold-vs-scanned gap rather than a
   * season-long backlog: a number that climbs is either genuine no-shows or the
   * door skipping scans, and both are worth seeing.
   */
  skippedNoShow: number
  failed: number
}

const T_PLUS_1_5H_MS = 1.5 * 60 * 60 * 1000

/** How far back a run still considers a show. See the window rationale above. */
export const REVIEW_WINDOW_DAYS = 7
const WINDOW_MS = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000

export async function dispatchReviewEmails(
  input: DispatchInput,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const now = input.now.getTime()
  const eligible = await deps.findEligibleOrders({
    from: new Date(now - WINDOW_MS),
    to: new Date(now - T_PLUS_1_5H_MS),
  })

  let sent = 0
  let skippedAlreadyClaimed = 0
  let skippedNoShow = 0
  let failed = 0

  for (const order of eligible) {
    // Deliberately before claimOrder: a no-show must stay unclaimed so a late
    // scan correction lets the next run send.
    if (!order.attended) {
      skippedNoShow++
      continue
    }
    const claimed = await deps.claimOrder(order.id)
    if (!claimed) {
      skippedAlreadyClaimed++
      continue
    }
    try {
      await deps.sendEmail(order)
      sent++
    } catch (err) {
      failed++
      // Un-mark so the next cron attempt picks it up again.
      try {
        await deps.releaseClaim(order.id)
      } catch {
        // releaseClaim itself failed — leave the row marked; manual recovery
        // via SQL is preferable to spinning here.
      }
      console.error(
        `[dispatchReviewEmails] sendEmail threw orderId=${order.id} email=${order.email} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  return {
    considered: eligible.length,
    sent,
    skippedAlreadyClaimed,
    skippedNoShow,
    failed,
  }
}
