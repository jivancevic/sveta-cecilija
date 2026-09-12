import { describe, it, expect } from 'vitest'
import {
  revenueCollectedCents,
  partnerReceivableCents,
  type CollectedOrderRow,
  type PartnerReceivableInput,
} from './revenue'

// --- Revenue collected: online (net of refunds) + the offline sales ledger ----

describe('revenueCollectedCents', () => {
  it('sums non-refunded online order totals', () => {
    const orders: CollectedOrderRow[] = [
      { totalCents: 4000, refundStatus: 'none' },
      { totalCents: 2000, refundStatus: 'none' },
    ]
    expect(revenueCollectedCents({ orders, offlineRevenueCents: 0 })).toBe(6000)
  })

  it('nets out refunded orders (excludes their total from collected revenue)', () => {
    const orders: CollectedOrderRow[] = [
      { totalCents: 4000, refundStatus: 'none' },
      { totalCents: 2000, refundStatus: 'refunded' }, // refunded -> not in hand
    ]
    expect(revenueCollectedCents({ orders, offlineRevenueCents: 0 })).toBe(4000)
  })

  it('treats only fully-refunded orders as removed; pending/failed refunds are still collected', () => {
    const orders: CollectedOrderRow[] = [
      { totalCents: 1000, refundStatus: 'pending' },
      { totalCents: 1000, refundStatus: 'failed' },
      { totalCents: 1000, refundStatus: 'refunded' },
    ]
    // Only the 'refunded' one leaves the till; pending/failed money is still in hand.
    expect(revenueCollectedCents({ orders, offlineRevenueCents: 0 })).toBe(2000)
  })

  it('adds offline cash exactly as the ledger priced it, not as a headcount', () => {
    // ADR-0025: the ledger sums quantity x the price actually charged, so a
    // child seat and a discounted seat are worth what was taken for them. The
    // old model multiplied a headcount by the flat EUR 20 adult face value and
    // could represent neither.
    expect(revenueCollectedCents({ orders: [], offlineRevenueCents: 5300 })).toBe(5300)
  })

  it('combines online (net of refunds) with offline cash', () => {
    const orders: CollectedOrderRow[] = [
      { totalCents: 4000, refundStatus: 'none' },
      { totalCents: 9999, refundStatus: 'refunded' },
    ]
    expect(revenueCollectedCents({ orders, offlineRevenueCents: 3500 })).toBe(7500)
  })

  it('is zero with no orders and no offline sales', () => {
    expect(revenueCollectedCents({ orders: [], offlineRevenueCents: 0 })).toBe(0)
  })
})

// --- Partner receivable: Σ (sold − cancelled) × face − commission --------------

describe('partnerReceivableCents', () => {
  it('is zero when there are no partners', () => {
    expect(partnerReceivableCents([])).toBe(0)
  })

  it('computes one partner as gross of active tickets minus commission', () => {
    const input: PartnerReceivableInput[] = [
      {
        commissionPercent: 10,
        tickets: [
          { type: 'adult', status: 'active' }, // 2000
          { type: 'child', status: 'active' }, // 1000
        ],
      },
    ]
    // gross 3000, commission round(3000*10/100)=300 -> receivable 2700
    expect(partnerReceivableCents(input)).toBe(2700)
  })

  it('excludes cancelled tickets (storno/refund) from the receivable', () => {
    const input: PartnerReceivableInput[] = [
      {
        commissionPercent: 10,
        tickets: [
          { type: 'adult', status: 'active' }, // 2000 billable
          { type: 'adult', status: 'cancelled' }, // not billed
        ],
      },
    ]
    // gross 2000, commission 200 -> 1800
    expect(partnerReceivableCents(input)).toBe(1800)
  })

  it('aggregates across multiple partners, each at its own commission rate', () => {
    const input: PartnerReceivableInput[] = [
      { commissionPercent: 10, tickets: [{ type: 'adult', status: 'active' }] }, // 2000-200=1800
      { commissionPercent: 20, tickets: [{ type: 'adult', status: 'active' }] }, // 2000-400=1600
    ]
    expect(partnerReceivableCents(input)).toBe(3400)
  })

  it('mirrors the reconciliation net (gross − commission), never adding revenue to it', () => {
    const input: PartnerReceivableInput[] = [
      {
        commissionPercent: 15,
        tickets: [
          { type: 'adult', status: 'active' },
          { type: 'adult', status: 'active' },
          { type: 'child', status: 'active' },
        ],
      },
    ]
    // gross = 2000+2000+1000 = 5000; commission = round(5000*15/100)=750; net=4250
    expect(partnerReceivableCents(input)).toBe(4250)
  })
})
