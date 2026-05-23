import { describe, it, expect, vi } from 'vitest'
import { handlePaymentSucceeded, type PaymentSucceededDeps } from './handle-payment-succeeded'

const FUTURE = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()

function makeDeps(overrides: Partial<PaymentSucceededDeps> = {}) {
  const show = {
    id: 'show_1',
    date: FUTURE,
    venue: 'ljetno-kino' as const,
    onlineSold: 5,
    inPersonSold: 2,
    status: 'active' as const,
  }
  const deps: PaymentSucceededDeps = {
    findOrderByPaymentIntent: vi.fn().mockResolvedValue(null),
    findShow: vi.fn().mockResolvedValue(show),
    createOrder: vi.fn().mockResolvedValue({ id: 'order_1' }),
    createQrToken: vi.fn().mockResolvedValue(undefined),
    incrementOnlineSold: vi.fn().mockResolvedValue(undefined),
    generateToken: vi.fn(() => 'tok_' + Math.random().toString(36).slice(2)),
    ...overrides,
  }
  return deps
}

function event(metadataOverrides: Record<string, string> = {}) {
  return {
    paymentIntentId: 'pi_123',
    amountReceived: 5000, // 50 EUR cents
    metadata: {
      showId: 'show_1',
      adults: '2',
      children: '1',
      buyerName: 'Ana',
      email: 'a@b.co',
      ...metadataOverrides,
    },
  }
}

describe('handlePaymentSucceeded', () => {
  it('creates an Order linked to the show', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps)
    expect(deps.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerName: 'Ana',
        email: 'a@b.co',
        adultCount: 2,
        childCount: 1,
        total: 5000,
        stripePaymentIntentId: 'pi_123',
        refundStatus: 'none',
        show: 'show_1',
      }),
    )
  })

  it('creates one QRToken per ticket', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps) // 2 + 1 = 3 tickets
    expect(deps.createQrToken).toHaveBeenCalledTimes(3)
  })

  it('each QRToken is generated with a unique value linked to the order', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps)
    const calls = (deps.createQrToken as ReturnType<typeof vi.fn>).mock.calls
    const tokens = calls.map((c) => c[0].token)
    expect(new Set(tokens).size).toBe(3)
    for (const call of calls) {
      expect(call[0].order).toBe('order_1')
    }
  })

  it('increments onlineSold by the total ticket count', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps)
    expect(deps.incrementOnlineSold).toHaveBeenCalledWith('show_1', 3)
  })

  it('is idempotent: skips when an order already exists for this paymentIntent', async () => {
    const deps = makeDeps({
      findOrderByPaymentIntent: vi.fn().mockResolvedValue({ id: 'order_existing' }),
    })
    await handlePaymentSucceeded(event(), deps)
    expect(deps.createOrder).not.toHaveBeenCalled()
    expect(deps.createQrToken).not.toHaveBeenCalled()
    expect(deps.incrementOnlineSold).not.toHaveBeenCalled()
  })
})
