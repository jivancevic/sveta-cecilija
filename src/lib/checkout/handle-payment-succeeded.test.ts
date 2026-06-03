import { describe, it, expect, vi } from 'vitest'
import { handlePaymentSucceeded, type PaymentSucceededDeps } from './handle-payment-succeeded'

function makeDeps(overrides: Partial<PaymentSucceededDeps> = {}) {
  let n = 0
  const deps: PaymentSucceededDeps = {
    findOrderByPaymentIntent: vi.fn().mockResolvedValue(null),
    createOrder: vi.fn().mockResolvedValue({ id: 'order_1' }),
    createTickets: vi.fn().mockResolvedValue(undefined),
    generateToken: vi.fn(() => `tok_${++n}`),
    generateOrderCode: vi.fn().mockResolvedValue('AB23'),
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
  it('creates an Order linked to the show, with the generated code and online channel', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps)
    expect(deps.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AB23',
        channel: 'online',
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

  it('creates one ticket per person, each typed and individually tokened', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event(), deps) // 2 adults + 1 child = 3 people
    expect(deps.createTickets).toHaveBeenCalledTimes(1)
    const { order, tickets } = (deps.createTickets as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(order).toBe('order_1')
    expect(tickets.map((t: { type: string }) => t.type)).toEqual(['adult', 'adult', 'child'])
    // Distinct, non-empty tokens, one per person.
    const tokens = tickets.map((t: { token: string }) => t.token)
    expect(new Set(tokens).size).toBe(3)
    expect(tokens.every((t: string) => t.length > 0)).toBe(true)
  })

  it('does NOT maintain shows.online_sold (seats are counted from tickets now)', async () => {
    // The dep no longer exists; assert the handler never reaches for it.
    const deps = makeDeps() as PaymentSucceededDeps & { incrementOnlineSold?: unknown }
    expect('incrementOnlineSold' in deps).toBe(false)
    await handlePaymentSucceeded(event(), deps)
    // Sanity: order + tickets still created.
    expect(deps.createOrder).toHaveBeenCalledTimes(1)
    expect(deps.createTickets).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: skips when an order already exists for this paymentIntent', async () => {
    const deps = makeDeps({
      findOrderByPaymentIntent: vi.fn().mockResolvedValue({ id: 'order_existing' }),
    })
    await handlePaymentSucceeded(event(), deps)
    expect(deps.createOrder).not.toHaveBeenCalled()
    expect(deps.createTickets).not.toHaveBeenCalled()
    expect(deps.generateOrderCode).not.toHaveBeenCalled()
    expect(deps.notifyBuyer).not.toHaveBeenCalled()
  })

  it('notifies the buyer with the full ticket list + order code after order creation', async () => {
    const deps = makeDeps()
    await handlePaymentSucceeded(event({ locale: 'hr' }), deps)
    expect(deps.notifyBuyer).toHaveBeenCalledTimes(1)
    const arg = (deps.notifyBuyer as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg).toMatchObject({
      orderId: 'order_1',
      showId: 'show_1',
      buyer: { name: 'Ana', email: 'a@b.co' },
      order: { adultCount: 2, childCount: 1, total: 5000 },
      orderCode: 'AB23',
      locale: 'hr',
    })
    // Every person's ticket (token + type + CODE-N ref) is forwarded for the PDF.
    expect(arg.tickets.map((t: { type: string }) => t.type)).toEqual(['adult', 'adult', 'child'])
    expect(arg.tickets.map((t: { ref: string }) => t.ref)).toEqual(['AB23-1', 'AB23-2', 'AB23-3'])
    // The forwarded tickets match what was persisted.
    const { tickets } = (deps.createTickets as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.tickets.map((t: { token: string }) => t.token)).toEqual(
      tickets.map((t: { token: string }) => t.token),
    )
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

  it('creates the order + tickets inside withSeatLock, keyed on the show id (#179)', async () => {
    const events: string[] = []
    const deps = makeDeps({
      createOrder: vi.fn(async () => {
        events.push('createOrder')
        return { id: 'order_1' }
      }),
      createTickets: vi.fn(async () => {
        events.push('createTickets')
      }),
      withSeatLock: vi.fn(async <T,>(showId: number, critical: () => Promise<T>) => {
        events.push(`lock:${showId}`)
        const r = await critical()
        events.push('unlock')
        return r
      }) as unknown as <T>(showId: number, critical: () => Promise<T>) => Promise<T>,
    })

    await handlePaymentSucceeded(event({ showId: '7' }), deps)

    expect(deps.withSeatLock).toHaveBeenCalledWith(7, expect.any(Function))
    // Both inserts happen strictly inside the lock; notifyBuyer runs after unlock.
    expect(events).toEqual(['lock:7', 'createOrder', 'createTickets', 'unlock'])
  })
})
