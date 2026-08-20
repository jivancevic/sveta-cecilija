import { describe, it, expect, vi } from 'vitest'
import {
  handleDisputeEvent,
  toDisputeEvent,
  DISPUTE_CREATED,
  DISPUTE_LOST,
  DISPUTE_WON,
  type DisputeEvent,
  type DisputedOrder,
  type HandleDisputeDeps,
} from './handle-dispute'

function makeOrder(overrides: Partial<DisputedOrder> = {}): DisputedOrder {
  return {
    id: '659',
    code: 'AB23',
    buyerName: 'Serena Salvi',
    email: 'serena@example.com',
    total: 4000,
    refundStatus: 'none',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<DisputeEvent> = {}): DisputeEvent {
  return {
    type: 'charge.dispute.created',
    disputeId: 'du_1U6QjU2LKHW8z1M1XiwGowiJ',
    paymentIntentId: 'pi_123',
    amountCents: 4000,
    currency: 'eur',
    reason: 'product_not_received',
    status: 'needs_response',
    evidenceDueBy: '2026-08-30T23:59:59.000Z',
    ...overrides,
  }
}

function makeDeps(
  order: DisputedOrder | null,
  overrides: Partial<HandleDisputeDeps> = {},
): HandleDisputeDeps {
  return {
    findOrderByPaymentIntent: vi.fn().mockResolvedValue(order),
    markRefunded: vi.fn().mockResolvedValue(undefined),
    voidTickets: vi.fn().mockResolvedValue(2),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    hasHandled: vi.fn().mockResolvedValue(false),
    record: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('toDisputeEvent', () => {
  it('normalizes a Stripe dispute object, converting due_by to an ISO deadline', () => {
    const evt = toDisputeEvent('charge.dispute.created', {
      id: 'du_1',
      amount: 4000,
      currency: 'eur',
      reason: 'product_not_received',
      status: 'needs_response',
      payment_intent: 'pi_abc',
      evidence_details: { due_by: 1788134399 },
    })

    expect(evt).toEqual({
      type: 'charge.dispute.created',
      disputeId: 'du_1',
      paymentIntentId: 'pi_abc',
      amountCents: 4000,
      currency: 'eur',
      reason: 'product_not_received',
      status: 'needs_response',
      evidenceDueBy: new Date(1788134399 * 1000).toISOString(),
    })
  })

  it('accepts an expanded payment_intent object and a missing evidence deadline', () => {
    const evt = toDisputeEvent('charge.dispute.closed', {
      id: 'du_2',
      amount: 2000,
      currency: 'eur',
      reason: 'fraudulent',
      status: 'lost',
      payment_intent: { id: 'pi_expanded' },
      evidence_details: { due_by: null },
    })

    expect(evt.paymentIntentId).toBe('pi_expanded')
    expect(evt.evidenceDueBy).toBeNull()
    expect(evt.status).toBe('lost')
  })

  it('degrades to safe defaults on a payload missing every optional field', () => {
    const evt = toDisputeEvent('charge.dispute.created', { id: 'du_3' })

    expect(evt.paymentIntentId).toBeNull()
    expect(evt.amountCents).toBe(0)
    expect(evt.currency).toBe('eur')
    expect(evt.reason).toBe('unknown')
    expect(evt.status).toBe('unknown')
    expect(evt.evidenceDueBy).toBeNull()
  })
})

describe('handleDisputeEvent — charge.dispute.created', () => {
  it('alerts admins with the order code and the evidence deadline, then records it', async () => {
    const order = makeOrder()
    const deps = makeDeps(order)

    const result = await handleDisputeEvent(makeEvent(), deps)

    expect(result).toEqual({ action: 'alerted', kind: DISPUTE_CREATED, orderId: '659' })
    expect(deps.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        disputeId: 'du_1U6QjU2LKHW8z1M1XiwGowiJ',
        reason: 'product_not_received',
        evidenceDueBy: '2026-08-30T23:59:59.000Z',
        order: expect.objectContaining({ id: '659', code: 'AB23' }),
      }),
    )
    expect(deps.record).toHaveBeenCalledWith(
      DISPUTE_CREATED,
      expect.objectContaining({ disputeId: 'du_1U6QjU2LKHW8z1M1XiwGowiJ', orderId: '659', orderCode: 'AB23' }),
    )
  })

  it('leaves the order and its tickets untouched — an open dispute is not a decision', async () => {
    const deps = makeDeps(makeOrder())

    await handleDisputeEvent(makeEvent(), deps)

    expect(deps.markRefunded).not.toHaveBeenCalled()
    expect(deps.voidTickets).not.toHaveBeenCalled()
  })

  it('still alerts (with no order attached) when no order matches the payment intent', async () => {
    const deps = makeDeps(null)

    const result = await handleDisputeEvent(makeEvent({ paymentIntentId: 'pi_unknown' }), deps)

    expect(result).toEqual({ action: 'alerted', kind: DISPUTE_CREATED, orderId: null })
    expect(deps.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ order: null }))
    expect(deps.record).toHaveBeenCalledWith(
      DISPUTE_CREATED,
      expect.objectContaining({ orderId: null, orderCode: null }),
    )
  })

  it('does not look up an order when Stripe sent no payment intent', async () => {
    const deps = makeDeps(null)

    const result = await handleDisputeEvent(makeEvent({ paymentIntentId: null }), deps)

    expect(result.action).toBe('alerted')
    expect(deps.findOrderByPaymentIntent).not.toHaveBeenCalled()
  })

  it('is idempotent: a redelivered created event neither re-alerts nor re-records', async () => {
    const deps = makeDeps(makeOrder(), { hasHandled: vi.fn().mockResolvedValue(true) })

    const result = await handleDisputeEvent(makeEvent(), deps)

    expect(result).toEqual({ action: 'duplicate', kind: DISPUTE_CREATED })
    expect(deps.notifyAdmins).not.toHaveBeenCalled()
    expect(deps.record).not.toHaveBeenCalled()
    expect(deps.findOrderByPaymentIntent).not.toHaveBeenCalled()
  })

  it('propagates a failed alert so the route can 500 and Stripe retries with backoff', async () => {
    const deps = makeDeps(makeOrder(), {
      notifyAdmins: vi.fn().mockRejectedValue(new Error('brevo down')),
    })

    await expect(handleDisputeEvent(makeEvent(), deps)).rejects.toThrow('brevo down')
    // Nothing recorded, so the retry is not suppressed by the idempotency ledger.
    expect(deps.record).not.toHaveBeenCalled()
  })
})

describe('handleDisputeEvent — charge.dispute.closed as lost', () => {
  const lost = () =>
    makeEvent({ type: 'charge.dispute.closed', status: 'lost', evidenceDueBy: null })

  it('marks the order refunded and cascade-voids its tickets so the seats free up', async () => {
    const deps = makeDeps(makeOrder())

    const result = await handleDisputeEvent(lost(), deps)

    expect(deps.markRefunded).toHaveBeenCalledWith('659')
    expect(deps.voidTickets).toHaveBeenCalledWith('659')
    expect(result).toEqual({ action: 'order_voided', kind: DISPUTE_LOST, orderId: '659', voided: 2 })
    expect(deps.record).toHaveBeenCalledWith(
      DISPUTE_LOST,
      expect.objectContaining({ orderId: '659', orderCode: 'AB23', ticketsVoided: 2 }),
    )
  })

  it('does not email the buyer about a lost dispute — the money already moved', async () => {
    const deps = makeDeps(makeOrder())

    await handleDisputeEvent(lost(), deps)

    // notifyAdmins is the only mail seam this module has, and the closed branch
    // must not use it; there is no buyer-facing send at all.
    expect(deps.notifyAdmins).not.toHaveBeenCalled()
  })

  it('skips the redundant mark but still voids when the order is already refunded', async () => {
    const deps = makeDeps(makeOrder({ refundStatus: 'refunded' }), {
      voidTickets: vi.fn().mockResolvedValue(0),
    })

    const result = await handleDisputeEvent(lost(), deps)

    expect(deps.markRefunded).not.toHaveBeenCalled()
    expect(deps.voidTickets).toHaveBeenCalledWith('659')
    expect(result).toEqual({ action: 'order_voided', kind: DISPUTE_LOST, orderId: '659', voided: 0 })
  })

  it('is idempotent: a redelivered lost event does not re-mark or re-void', async () => {
    const deps = makeDeps(makeOrder(), { hasHandled: vi.fn().mockResolvedValue(true) })

    const result = await handleDisputeEvent(lost(), deps)

    expect(result).toEqual({ action: 'duplicate', kind: DISPUTE_LOST })
    expect(deps.markRefunded).not.toHaveBeenCalled()
    expect(deps.voidTickets).not.toHaveBeenCalled()
    expect(deps.record).not.toHaveBeenCalled()
  })

  it('records and no-ops (never throws) when no order matches the payment intent', async () => {
    const deps = makeDeps(null)

    const result = await handleDisputeEvent(lost(), deps)

    expect(result).toEqual({
      action: 'noop',
      reason: 'no order matches the disputed payment intent',
    })
    expect(deps.markRefunded).not.toHaveBeenCalled()
    expect(deps.voidTickets).not.toHaveBeenCalled()
    expect(deps.record).toHaveBeenCalledWith(DISPUTE_LOST, expect.objectContaining({ matched: false }))
  })

  it('separates the created and lost ledger keys so both events are handled once each', async () => {
    const handled = new Set<string>()
    const deps = makeDeps(makeOrder(), {
      hasHandled: vi.fn(async (kind: string, id: string) => handled.has(`${kind}:${id}`)),
      record: vi.fn(async (kind: string, ctx: Record<string, unknown>) => {
        handled.add(`${kind}:${String(ctx.disputeId)}`)
      }),
    })

    expect((await handleDisputeEvent(makeEvent(), deps)).action).toBe('alerted')
    expect((await handleDisputeEvent(makeEvent(), deps)).action).toBe('duplicate')
    expect((await handleDisputeEvent(lost(), deps)).action).toBe('order_voided')
    expect((await handleDisputeEvent(lost(), deps)).action).toBe('duplicate')
    expect(deps.voidTickets).toHaveBeenCalledTimes(1)
  })
})

describe('handleDisputeEvent — charge.dispute.closed, other statuses', () => {
  it('records a won dispute and leaves the order intact', async () => {
    const deps = makeDeps(makeOrder())

    const result = await handleDisputeEvent(
      makeEvent({ type: 'charge.dispute.closed', status: 'won' }),
      deps,
    )

    expect(result).toEqual({ action: 'noop', reason: 'dispute won; order left intact' })
    expect(deps.markRefunded).not.toHaveBeenCalled()
    expect(deps.voidTickets).not.toHaveBeenCalled()
    expect(deps.notifyAdmins).not.toHaveBeenCalled()
    expect(deps.record).toHaveBeenCalledWith(DISPUTE_WON, expect.objectContaining({ orderId: '659' }))
  })

  it.each(['warning_closed', 'charge_refunded'])(
    'takes no action on a dispute closed as %s',
    async (status) => {
      const deps = makeDeps(makeOrder())

      const result = await handleDisputeEvent(
        makeEvent({ type: 'charge.dispute.closed', status }),
        deps,
      )

      expect(result).toEqual({
        action: 'noop',
        reason: `dispute closed as ${status}; nothing to do`,
      })
      expect(deps.hasHandled).not.toHaveBeenCalled()
      expect(deps.record).not.toHaveBeenCalled()
      expect(deps.voidTickets).not.toHaveBeenCalled()
    },
  )

  it('no-ops on an event with no dispute id rather than writing an unkeyable ledger row', async () => {
    const deps = makeDeps(makeOrder())

    const result = await handleDisputeEvent(makeEvent({ disputeId: '' }), deps)

    expect(result).toEqual({ action: 'noop', reason: 'dispute event has no id' })
    expect(deps.record).not.toHaveBeenCalled()
  })
})
