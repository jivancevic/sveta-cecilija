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

  it('claims the ledger row with an ON CONFLICT insert, not a read-then-write check', async () => {
    // A returned row means we won the insert and own the event.
    const pool = fakePool([{ id: 7 }])
    const deps = buildDisputeDeps(fakePayload(), pool)

    expect(await deps.claimEvent(DISPUTE_LOST, 'du_1', { amountCents: 4000 })).toBe(true)
    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('INSERT INTO critical_events')
    expect(sql).toContain('ON CONFLICT DO NOTHING')
    expect(sql).toContain('RETURNING id')
    expect(params[0]).toBe(DISPUTE_LOST)
    expect(JSON.parse(params[1] as string)).toEqual({ amountCents: 4000, disputeId: 'du_1' })
  })

  it('loses the claim when the row already exists (Stripe redelivery)', async () => {
    const pool = fakePool([])
    const deps = buildDisputeDeps(fakePayload(), pool)
    expect(await deps.claimEvent(DISPUTE_LOST, 'du_seen', {})).toBe(false)
  })

  it('lets a ledger failure escape the claim rather than acting unguarded', async () => {
    const pool = fakePool()
    pool.query.mockRejectedValueOnce(new Error('ledger unreachable'))
    const deps = buildDisputeDeps(fakePayload(), pool)

    // Deliberately NOT recordCriticalEvent's swallow-everything contract: a
    // guard that silently fails open would let a retry act a second time.
    await expect(deps.claimEvent(DISPUTE_LOST, 'du_1', {})).rejects.toThrow('ledger unreachable')
  })

  it('releases a claim by deleting its row so a Stripe retry can redo the work', async () => {
    const pool = fakePool()
    const deps = buildDisputeDeps(fakePayload(), pool)

    await deps.releaseEvent(DISPUTE_LOST, 'du_1')

    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('DELETE FROM critical_events')
    expect(params).toEqual([DISPUTE_LOST, 'du_1'])
  })

  it('enriches the claimed row on finalize', async () => {
    const pool = fakePool()
    const deps = buildDisputeDeps(fakePayload(), pool)

    await deps.finalizeEvent(DISPUTE_LOST, 'du_1', { orderId: '659', ticketsVoided: 2 })

    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('UPDATE critical_events')
    expect(params[0]).toBe(DISPUTE_LOST)
    expect(params[1]).toBe('du_1')
    expect(JSON.parse(params[2] as string)).toEqual({
      orderId: '659',
      ticketsVoided: 2,
      disputeId: 'du_1',
    })
  })

  it('swallows a finalize failure — the money and tickets are already correct', async () => {
    const pool = fakePool()
    pool.query.mockRejectedValueOnce(new Error('db gone'))
    const deps = buildDisputeDeps(fakePayload(), pool)

    await expect(deps.finalizeEvent(DISPUTE_LOST, 'du_1', {})).resolves.toBeUndefined()
  })
})
