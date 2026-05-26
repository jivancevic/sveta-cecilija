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
    notifyBuyer: vi.fn().mockResolvedValue(undefined),
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

  it('creates exactly one QRToken per order regardless of ticket count', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps) // 2 + 1 = 3 tickets
    expect(deps.createQrToken).toHaveBeenCalledTimes(1)
  })

  it('the QRToken is linked to the order', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps)
    const calls = (deps.createQrToken as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0].order).toBe('order_1')
    expect(typeof calls[0][0].token).toBe('string')
    expect(calls[0][0].token.length).toBeGreaterThan(0)
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
    expect(deps.notifyBuyer).not.toHaveBeenCalled()
  })

  it('notifies the buyer with order + token info after order creation', async () => {
    const deps = makeDeps({
      generateToken: vi.fn(() => 'tok_single'),
    })
    await handlePaymentSucceeded(event({ locale: 'hr' }), deps)
    expect(deps.notifyBuyer).toHaveBeenCalledTimes(1)
    expect(deps.notifyBuyer).toHaveBeenCalledWith({
      orderId: 'order_1',
      showId: 'show_1',
      buyer: { name: 'Ana', email: 'a@b.co' },
      order: { adultCount: 2, childCount: 1, total: 5000 },
      token: 'tok_single',
      locale: 'hr',
    })
    // The single token passed to notifyBuyer matches the token persisted.
    const qrCall = (deps.createQrToken as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(qrCall.token).toBe('tok_single')
  })

  it('defaults locale to en when metadata omits it', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps)
    expect(deps.notifyBuyer).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' }),
    )
  })

  it('throws UnrecoverableWebhookError when showId metadata is missing', async () => {
    const deps = makeDeps()
    const evt = event()
    delete (evt.metadata as Record<string, string | undefined>).showId
    await expect(handlePaymentSucceeded(evt, deps)).rejects.toMatchObject({
      name: 'UnrecoverableWebhookError',
    })
  })

  it('throws UnrecoverableWebhookError when ticket count is zero', async () => {
    const deps = makeDeps()
    await expect(
      handlePaymentSucceeded(event({ adults: '0', children: '0' }), deps),
    ).rejects.toMatchObject({ name: 'UnrecoverableWebhookError' })
  })
})
