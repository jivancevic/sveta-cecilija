import { describe, it, expect, vi } from 'vitest'
import { refundOrder, type RefundOrderDeps } from './refund-order'

type OrderRecord = {
  id: string
  buyerName: string
  email: string
  total: number
  stripePaymentIntentId: string | null
  refundStatus: 'none' | 'refunded'
  show: { id: string; date: string; time: string; venue: 'ljetno-kino' | 'zimsko-kino' }
}

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'order_1',
    buyerName: 'Ana',
    email: 'ana@example.com',
    total: 4000,
    stripePaymentIntentId: 'pi_123',
    refundStatus: 'none',
    show: { id: 'show_1', date: '2026-07-01', time: '21:00', venue: 'ljetno-kino' },
    ...overrides,
  }
}

function makeDeps(order: OrderRecord | null, overrides: Partial<RefundOrderDeps> = {}): RefundOrderDeps {
  return {
    getOrder: vi.fn().mockResolvedValue(order),
    refundViaStripe: vi.fn().mockResolvedValue({ id: 're_123' }),
    markRefunded: vi.fn().mockResolvedValue(undefined),
    voidTickets: vi.fn().mockResolvedValue(0),
    sendRefundEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('refundOrder', () => {
  it('refunds the full amount via Stripe, marks the order refunded, and emails the buyer', async () => {
    const order = makeOrder({ total: 4000, stripePaymentIntentId: 'pi_abc' })
    const deps = makeDeps(order)

    const result = await refundOrder({ orderId: 'order_1' }, deps)

    expect(result).toEqual({ refunded: true, amountCents: 4000 })
    expect(deps.refundViaStripe).toHaveBeenCalledWith({ paymentIntentId: 'pi_abc', amountCents: 4000 })
    expect(deps.markRefunded).toHaveBeenCalledWith('order_1')
    expect(deps.sendRefundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order_1',
        buyer: { name: 'Ana', email: 'ana@example.com' },
        amountCents: 4000,
      }),
    )
  })

  it('cascade-voids the order tickets (freeing seats) after marking refunded', async () => {
    const order = makeOrder()
    const calls: string[] = []
    const deps = makeDeps(order, {
      markRefunded: vi.fn(async () => { calls.push('mark') }),
      voidTickets: vi.fn(async () => { calls.push('void'); return 3 }),
    })

    await refundOrder({ orderId: 'order_1' }, deps)

    expect(deps.voidTickets).toHaveBeenCalledWith('order_1')
    // Tickets are voided after the order is marked refunded.
    expect(calls).toEqual(['mark', 'void'])
  })

  it('is idempotent: a second refund call does not hit Stripe, re-void, or re-email', async () => {
    const order = makeOrder({ refundStatus: 'refunded' })
    const deps = makeDeps(order)

    const result = await refundOrder({ orderId: 'order_1' }, deps)

    expect(result).toEqual({ refunded: false, amountCents: 4000 })
    expect(deps.refundViaStripe).not.toHaveBeenCalled()
    expect(deps.markRefunded).not.toHaveBeenCalled()
    expect(deps.voidTickets).not.toHaveBeenCalled()
    expect(deps.sendRefundEmail).not.toHaveBeenCalled()
  })

  it('throws when the order does not exist', async () => {
    const deps = makeDeps(null)
    await expect(refundOrder({ orderId: 'missing' }, deps)).rejects.toThrow(/not found/i)
    expect(deps.refundViaStripe).not.toHaveBeenCalled()
  })

  it('throws when the order has no Stripe payment intent (e.g. in-person sale)', async () => {
    const order = makeOrder({ stripePaymentIntentId: null })
    const deps = makeDeps(order)
    await expect(refundOrder({ orderId: 'order_1' }, deps)).rejects.toThrow(/payment intent/i)
    expect(deps.refundViaStripe).not.toHaveBeenCalled()
  })

  it('does not mark the order refunded if Stripe fails — caller can retry safely', async () => {
    const order = makeOrder()
    const deps = makeDeps(order, {
      refundViaStripe: vi.fn().mockRejectedValue(new Error('Stripe down')),
    })
    await expect(refundOrder({ orderId: 'order_1' }, deps)).rejects.toThrow(/Stripe down/)
    expect(deps.markRefunded).not.toHaveBeenCalled()
    expect(deps.voidTickets).not.toHaveBeenCalled()
    expect(deps.sendRefundEmail).not.toHaveBeenCalled()
  })
})
