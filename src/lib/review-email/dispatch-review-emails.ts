// Pure orchestration for the post-show review email (sent T+1.5h after the show).
//
// Eligibility (all required):
//   1. Show date+time was >= 1.5h ago (i.e. now - showStart >= 1.5h)
//   2. order.review_email_sent_at IS NULL
//   3. order has at least one ticket (adult_count + child_count > 0)
//   4. order.refund_status != 'refunded'
//   5. buyer email is not in marketing_optouts — pre-filtered in the caller's
//      SQL; authoritatively gated in sendReviewEmail (src/lib/marketing/opt-out)
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
}

export interface DispatchInput {
  /** Reference "now" — usually `new Date()`, parameterised for tests. */
  now: Date
}

export interface DispatchDeps {
  /**
   * Returns every order whose show's local date+time is at least 1.5h before
   * `cutoff` AND not already marked sent AND has tickets AND not refunded AND
   * the buyer email is not opted out. Show date+time is treated as
   * Europe/Zagreb wall clock and converted by the caller's SQL (see route).
   */
  findEligibleOrders: (cutoff: Date) => Promise<EligibleOrder[]>
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
  failed: number
}

const T_PLUS_1_5H_MS = 1.5 * 60 * 60 * 1000

export async function dispatchReviewEmails(
  input: DispatchInput,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const cutoff = new Date(input.now.getTime() - T_PLUS_1_5H_MS)
  const eligible = await deps.findEligibleOrders(cutoff)

  let sent = 0
  let skippedAlreadyClaimed = 0
  let failed = 0

  for (const order of eligible) {
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
    failed,
  }
}
