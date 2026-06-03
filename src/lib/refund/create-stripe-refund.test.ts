import { describe, it, expect, vi } from 'vitest'
import { createStripeRefund, refundIdempotencyKey } from './create-stripe-refund'

describe('createStripeRefund', () => {
  it('passes a stable per-payment-intent idempotency key to Stripe', async () => {
    const create = vi.fn().mockResolvedValue({ id: 're_1' })
    const stripe = { refunds: { create } }

    const result = await createStripeRefund(stripe, { paymentIntentId: 'pi_abc', amountCents: 4000 })

    expect(result).toEqual({ id: 're_1' })
    expect(create).toHaveBeenCalledWith(
      { payment_intent: 'pi_abc', amount: 4000 },
      { idempotencyKey: 'refund:pi_abc' },
    )
  })

  it('uses the same key across calls for the same payment intent (retry returns the original refund)', async () => {
    // Stripe replays the original refund for a repeated key, so we model that:
    // both calls resolve to the SAME refund id.
    const create = vi.fn().mockResolvedValue({ id: 're_original' })
    const stripe = { refunds: { create } }

    const first = await createStripeRefund(stripe, { paymentIntentId: 'pi_x', amountCents: 2000 })
    const retry = await createStripeRefund(stripe, { paymentIntentId: 'pi_x', amountCents: 2000 })

    expect(first).toEqual(retry)
    const keys = create.mock.calls.map((c) => c[1]?.idempotencyKey)
    expect(keys).toEqual(['refund:pi_x', 'refund:pi_x'])
  })

  it('refundIdempotencyKey is scoped to the payment intent', () => {
    expect(refundIdempotencyKey('pi_1')).toBe('refund:pi_1')
    expect(refundIdempotencyKey('pi_2')).not.toBe(refundIdempotencyKey('pi_1'))
  })
})
