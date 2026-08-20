import { describe, it, expect, vi } from 'vitest'
import type { Payload } from 'payload'
import { buildDisputeDeps } from './build-dispute-deps'
import { DISPUTE_LOST } from './handle-dispute'

function fakePayload(over: Record<string, unknown> = {}) {
  return {
    find: vi.fn().mockResolvedValue({ docs: [] }),
    update: vi.fn().mockResolvedValue({}),
    db: { drizzle: { execute: vi.fn().mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] }) } },
    ...over,
  } as unknown as Payload
}

const fakePool = (rows: Record<string, unknown>[] = []) => ({
  query: vi.fn().mockResolvedValue({ rows }),
})

describe('buildDisputeDeps', () => {
  it('finds the order by stripePaymentIntentId and maps it to the dispute shape', async () => {
    const payload = fakePayload({
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            id: 659,
            code: 'AB23',
            buyerName: 'Serena Salvi',
            email: 'serena@example.com',
            total: 4000,
            refundStatus: 'none',
          },
        ],
      }),
    })
    const deps = buildDisputeDeps(payload, fakePool())

    expect(await deps.findOrderByPaymentIntent('pi_abc')).toEqual({
      id: '659',
      code: 'AB23',
      buyerName: 'Serena Salvi',
      email: 'serena@example.com',
      total: 4000,
      refundStatus: 'none',
    })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'orders',
        where: { stripePaymentIntentId: { equals: 'pi_abc' } },
      }),
    )
  })

  it('returns null when no order carries that payment intent', async () => {
    const deps = buildDisputeDeps(fakePayload(), fakePool())
    expect(await deps.findOrderByPaymentIntent('pi_missing')).toBeNull()
  })

  it('voids through the shared ticket-void primitive and reports the count', async () => {
    const payload = fakePayload()
    const deps = buildDisputeDeps(payload, fakePool())

    expect(await deps.voidTickets('659')).toBe(2)
    const drizzle = (payload.db as unknown as { drizzle: { execute: ReturnType<typeof vi.fn> } })
      .drizzle
    expect(drizzle.execute).toHaveBeenCalledOnce()
  })

  it('marks the order refunded (no third enum value)', async () => {
    const payload = fakePayload()
    const deps = buildDisputeDeps(payload, fakePool())

    await deps.markRefunded('659')

    expect(payload.update).toHaveBeenCalledWith({
      collection: 'orders',
      id: '659',
      data: { refundStatus: 'refunded' },
    })
  })

  it('reads the idempotency ledger keyed on kind + disputeId', async () => {
    const pool = fakePool([{ '?column?': 1 }])
    const deps = buildDisputeDeps(fakePayload(), pool)

    expect(await deps.hasHandled(DISPUTE_LOST, 'du_1')).toBe(true)
    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('critical_events')
    expect(sql).toContain(`context->>'disputeId'`)
    expect(params).toEqual([DISPUTE_LOST, 'du_1'])
  })

  it('reports an unseen dispute as unhandled', async () => {
    const pool = fakePool([])
    const deps = buildDisputeDeps(fakePayload(), pool)
    expect(await deps.hasHandled(DISPUTE_LOST, 'du_new')).toBe(false)
  })

  it('records the audit row into critical_events', async () => {
    const pool = fakePool()
    const deps = buildDisputeDeps(fakePayload(), pool)

    await deps.record(DISPUTE_LOST, { disputeId: 'du_1', orderId: '659' })

    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('INSERT INTO critical_events')
    expect(params[0]).toBe(DISPUTE_LOST)
    expect(JSON.parse(params[1] as string)).toEqual({ disputeId: 'du_1', orderId: '659' })
  })
})
