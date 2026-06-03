// Stripe refund call, extracted with DI so the idempotency key is unit-testable
// (#174). A retry after a partial failure (Stripe refunded ✅ but markRefunded
// then threw) re-calls this with the SAME key, so Stripe returns the ORIGINAL
// refund instead of erroring ("amount exceeds the refundable amount") or — if
// partial refunds are ever added — issuing a second refund. The flow becomes
// safely re-runnable end to end. Keys are honoured by Stripe for 24h; the
// payment intent is the natural idempotency scope (one PI = one full refund).

/** Minimal structural slice of Stripe's `refunds` API — the real client satisfies it. */
export interface StripeRefundsApi {
  create: (
    params: { payment_intent: string; amount: number },
    options?: { idempotencyKey?: string },
  ) => Promise<{ id: string }>
}

/** Stable per-payment-intent idempotency key. One PI = one full refund. */
export function refundIdempotencyKey(paymentIntentId: string): string {
  return `refund:${paymentIntentId}`
}

export async function createStripeRefund(
  stripe: { refunds: StripeRefundsApi },
  args: { paymentIntentId: string; amountCents: number },
): Promise<{ id: string }> {
  const refund = await stripe.refunds.create(
    { payment_intent: args.paymentIntentId, amount: args.amountCents },
    { idempotencyKey: refundIdempotencyKey(args.paymentIntentId) },
  )
  return { id: refund.id }
}
