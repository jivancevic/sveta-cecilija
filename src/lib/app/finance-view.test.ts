import { describe, expect, it } from 'vitest'
import {
  groupLedgerByPerformance,
  partnerReceivable,
  resolveReceivableMonth,
  seasonMoney,
} from './finance-view'

describe('seasonMoney', () => {
  it('adds online order totals net of refunds to the offline ledger', () => {
    const out = seasonMoney({
      orders: [
        { totalCents: 4000, refundStatus: 'none' },
        { totalCents: 3000, refundStatus: 'refunded' },
        { totalCents: 1000, refundStatus: 'pending' },
      ],
      offlineRevenueCents: 2500,
    })

    // 4000 + 1000 kept (a pending refund is still money in hand), 3000 gone.
    expect(out.onlineNetCents).toBe(5000)
    expect(out.offlineCents).toBe(2500)
    expect(out.collectedCents).toBe(7500)
  })

  it('counts refunded orders and what went back with them', () => {
    const out = seasonMoney({
      orders: [
        { totalCents: 4000, refundStatus: 'refunded' },
        { totalCents: 2000, refundStatus: 'refunded' },
        { totalCents: 6000, refundStatus: 'none' },
        { totalCents: 500, refundStatus: 'failed' },
      ],
      offlineRevenueCents: 0,
    })

    expect(out.refundCount).toBe(2)
    expect(out.refundedCents).toBe(6000)
    expect(out.collectedCents).toBe(6500)
  })

  it('is zero across the board for a season with nothing in it', () => {
    const out = seasonMoney({ orders: [], offlineRevenueCents: 0 })
    expect(out).toEqual({
      collectedCents: 0,
      onlineNetCents: 0,
      offlineCents: 0,
      refundCount: 0,
      refundedCents: 0,
    })
  })
})

const KALETA = { id: '1', name: 'Kaleta', commissionPercent: 10 }
const AMINESS = { id: '2', name: 'Aminess', commissionPercent: 15 }
const MARCO = { id: '3', name: 'Marco Polo', commissionPercent: 10 }

describe('partnerReceivable', () => {
  it('bills each partner its own rate over its own active tickets', () => {
    const out = partnerReceivable(
      [KALETA, AMINESS, MARCO],
      [
        // Kaleta: 2 adults + 1 child active = 20 + 20 + 10 = 50,00 €.
        { partnerId: '1', type: 'adult', status: 'active' },
        { partnerId: '1', type: 'adult', status: 'active' },
        { partnerId: '1', type: 'child', status: 'active' },
        // Aminess: one adult sold, one cancelled and therefore never billed.
        { partnerId: '2', type: 'adult', status: 'active' },
        { partnerId: '2', type: 'adult', status: 'cancelled' },
      ],
    )

    expect(out.rows.map((r) => r.partnerName)).toEqual(['Kaleta', 'Aminess', 'Marco Polo'])

    const [kaleta, aminess, marco] = out.rows
    expect(kaleta).toMatchObject({
      ticketsSold: 3,
      grossCents: 5000,
      commissionCents: 500,
      netCents: 4500,
    })
    expect(aminess).toMatchObject({
      ticketsSold: 1,
      cancelledCount: 1,
      grossCents: 2000,
      commissionCents: 300,
      netCents: 1700,
    })
    // A partner that sold nothing is still a row: "nothing owed" is an answer.
    expect(marco).toMatchObject({ ticketsSold: 0, grossCents: 0, netCents: 0 })
  })

  it('totals the receivable across partners', () => {
    const out = partnerReceivable(
      [KALETA, AMINESS],
      [
        { partnerId: '1', type: 'adult', status: 'active' },
        { partnerId: '2', type: 'adult', status: 'active' },
      ],
    )
    // 2000 - 200 = 1800, plus 2000 - 300 = 1700.
    expect(out.totalNetCents).toBe(3500)
  })

  it('ignores a ticket whose partner is not in the list', () => {
    const out = partnerReceivable([KALETA], [{ partnerId: '99', type: 'adult', status: 'active' }])
    expect(out.rows).toHaveLength(1)
    expect(out.totalNetCents).toBe(0)
  })
})

const JULY = { showId: '5', showDate: '2026-07-17', venue: 'ljetno-kino' as const }
const AUGUST = { showId: '6', showDate: '2026-08-02', venue: 'ljetno-kino' as const }

describe('groupLedgerByPerformance', () => {
  it('subtotals each evening from its own lines, corrections included', () => {
    const out = groupLedgerByPerformance([
      { ...JULY, source: 'door', ticketType: 'adult', quantity: 10, unitPriceCents: 2000, discountLabel: null },
      { ...JULY, source: 'door', ticketType: 'child', quantity: 4, unitPriceCents: 1000, discountLabel: null },
      {
        ...JULY,
        source: 'door',
        ticketType: 'adult',
        quantity: 32,
        unitPriceCents: 1500,
        discountLabel: 'Umirovljenici',
      },
      // A miscount corrected the only way ADR-0025 allows: a negative line at
      // the price it was entered at.
      { ...JULY, source: 'door', ticketType: 'adult', quantity: -2, unitPriceCents: 2000, discountLabel: null },
      { ...AUGUST, source: 'legacy', ticketType: 'adult', quantity: 5, unitPriceCents: 2000, discountLabel: null },
    ])

    // Newest evening first: August before July.
    expect(out.map((p) => p.showId)).toEqual(['6', '5'])

    const july = out[1]
    expect(july.lines).toHaveLength(4)
    expect(july.seats).toBe(44)
    // 20000 + 4000 + 48000 - 4000
    expect(july.revenueCents).toBe(68000)

    expect(out[0]).toMatchObject({ seats: 5, revenueCents: 10000 })
  })

  it('is empty when the ledger is', () => {
    expect(groupLedgerByPerformance([])).toEqual([])
  })
})

// "Today" in Europe/Zagreb, resolved by the caller: September 2026.
const NOW = { year: 2026, month: 9 }

describe('resolveReceivableMonth', () => {
  it('opens on the current Zagreb month when nothing is asked for', () => {
    expect(resolveReceivableMonth(NOW, undefined, undefined)).toEqual(NOW)
    expect(resolveReceivableMonth(NOW, 'rujan', 'devet')).toEqual(NOW)
  })

  it('takes a month that has already begun', () => {
    expect(resolveReceivableMonth(NOW, '2026', '7')).toEqual({ year: 2026, month: 7 })
    expect(resolveReceivableMonth(NOW, '2025', '12')).toEqual({ year: 2025, month: 12 })
  })

  it('refuses a month that has not happened yet', () => {
    // A statement for November 2026 cannot exist on a September afternoon.
    expect(resolveReceivableMonth(NOW, '2026', '11')).toEqual({ year: 2026, month: 9 })
  })

  it('clamps a month outside 1 to 12', () => {
    expect(resolveReceivableMonth(NOW, '2025', '0')).toEqual({ year: 2025, month: 1 })
    expect(resolveReceivableMonth(NOW, '2025', '13')).toEqual({ year: 2025, month: 12 })
  })

  it('falls back only on the half it cannot honour', () => {
    // A year the picker does not offer becomes this one, and the month it was
    // asked for survives when that month has happened.
    expect(resolveReceivableMonth(NOW, '2027', '3')).toEqual({ year: 2026, month: 3 })
    expect(resolveReceivableMonth(NOW, '1998', '4')).toEqual({ year: 2026, month: 4 })
  })
})
