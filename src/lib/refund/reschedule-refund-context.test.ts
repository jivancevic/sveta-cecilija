import { describe, it, expect } from 'vitest'
import {
  evaluateRefundEligibility,
  loadRefundContext,
  resolveRescheduleRefund,
  type RefundOrderContext,
} from './reschedule-refund-context'
import { signRescheduleRefundToken } from './reschedule-refund-token'

const SECRET = 'test-secret'

function ctx(overrides: Partial<RefundOrderContext> = {}): RefundOrderContext {
  return {
    order: {
      id: '10',
      code: 'AB23',
      channel: 'online',
      refundStatus: 'none',
      stripePaymentIntentId: 'pi_123',
      adultCount: 2,
      childCount: 1,
      total: 5000,
      locale: 'en',
      buyerName: 'Ana Horvat',
      email: 'ana@example.com',
      showId: '7',
      ...overrides.order,
    },
    show: { date: '2026-07-22', time: '21:00', venue: 'ljetno-kino', rescheduled: true, ...overrides.show },
    scannedCount: overrides.scannedCount ?? 0,
  }
}

describe('evaluateRefundEligibility', () => {
  it('is ELIGIBLE for a rescheduled, online, unscanned, un-refunded order', () => {
    expect(evaluateRefundEligibility(ctx())).toBe('ELIGIBLE')
  })

  it('blocks when the show was never rescheduled (scope of the right)', () => {
    expect(evaluateRefundEligibility(ctx({ show: { rescheduled: false } as never }))).toBe('NOT_RESCHEDULED')
  })

  it('blocks a comp order (no payment to reverse)', () => {
    expect(
      evaluateRefundEligibility(ctx({ order: { channel: 'comp', stripePaymentIntentId: null } as never })),
    ).toBe('NOT_ONLINE')
  })

  it('blocks an online order with no payment intent', () => {
    expect(evaluateRefundEligibility(ctx({ order: { stripePaymentIntentId: null } as never }))).toBe('NOT_ONLINE')
  })

  it('reports ALREADY_REFUNDED idempotently', () => {
    expect(evaluateRefundEligibility(ctx({ order: { refundStatus: 'refunded' } as never }))).toBe('ALREADY_REFUNDED')
  })

  it('blocks once any ticket has been scanned (consumed at the door)', () => {
    expect(evaluateRefundEligibility(ctx({ scannedCount: 1 }))).toBe('SCANNED')
  })

  it('still allows a refund after the show date when nothing was scanned (no-show)', () => {
    // No time-window check: a past show with 0 scans is still refundable.
    expect(evaluateRefundEligibility(ctx({ show: { date: '2020-01-01', rescheduled: true } as never }))).toBe(
      'ELIGIBLE',
    )
  })

  it('prioritises the reschedule-scope check over other blockers', () => {
    // Not rescheduled + refunded + scanned → the scope failure wins.
    expect(
      evaluateRefundEligibility(
        ctx({ show: { rescheduled: false } as never, order: { refundStatus: 'refunded' } as never, scannedCount: 3 }),
      ),
    ).toBe('NOT_RESCHEDULED')
  })
})

// A fake pool returning one canned row so loadRefundContext's mapping is covered.
function fakePool(row: Record<string, unknown> | null) {
  return { query: async () => ({ rows: row ? [row] : [] }) }
}

const DB_ROW = {
  id: 10,
  code: 'AB23',
  channel: 'online',
  refund_status: 'none',
  stripe_payment_intent_id: 'pi_123',
  adult_count: 2,
  child_count: 1,
  total: 5000,
  locale: 'en',
  buyer_name: 'Ana Horvat',
  email: 'ana@example.com',
  show_id: 7,
  show_date: new Date('2026-07-22T12:00:00Z'),
  show_time: '21:00',
  show_venue: 'ljetno-kino',
  date_changed_at: new Date('2026-07-17T10:00:00Z'),
  scanned_count: 0,
}

describe('loadRefundContext', () => {
  it('maps a DB row (Date columns, numeric strings) into the typed context', async () => {
    const c = await loadRefundContext('10', fakePool(DB_ROW))
    expect(c).not.toBeNull()
    expect(c!.order.total).toBe(5000)
    expect(c!.order.channel).toBe('online')
    expect(c!.show.date).toBe('2026-07-22')
    expect(c!.show.rescheduled).toBe(true)
    expect(c!.scannedCount).toBe(0)
  })

  it('marks rescheduled=false when date_changed_at is null', async () => {
    const c = await loadRefundContext('10', fakePool({ ...DB_ROW, date_changed_at: null }))
    expect(c!.show.rescheduled).toBe(false)
  })

  it('returns null for an unknown order', async () => {
    expect(await loadRefundContext('999', fakePool(null))).toBeNull()
  })
})

describe('resolveRescheduleRefund', () => {
  it('returns INVALID for a forged token without touching the pool', async () => {
    let queried = false
    const pool = { query: async () => { queried = true; return { rows: [] } } }
    const res = await resolveRescheduleRefund('bogus.token', SECRET, pool)
    expect(res.state).toBe('INVALID')
    expect(res.ctx).toBeNull()
    expect(queried).toBe(false)
  })

  it('returns INVALID when the token is valid but the order is gone', async () => {
    const token = signRescheduleRefundToken('10', SECRET)
    const res = await resolveRescheduleRefund(token, SECRET, fakePool(null))
    expect(res.state).toBe('INVALID')
  })

  it('resolves a genuine token to ELIGIBLE with the loaded context', async () => {
    const token = signRescheduleRefundToken('10', SECRET)
    const res = await resolveRescheduleRefund(token, SECRET, fakePool(DB_ROW))
    expect(res.state).toBe('ELIGIBLE')
    expect(res.ctx!.order.code).toBe('AB23')
  })
})
