import { describe, expect, it } from 'vitest'
import {
  groupLedgerByPerformance,
  partnerReceivable,
  partnersInvolved,
  promoRevenue,
  resolveReceivableMonth,
  seasonMoney,
} from './finance-view'

describe('seasonMoney', () => {
  it('adds online order totals net of refunds to the offline ledger', () => {
    const out = seasonMoney({
      orders: [
        { channel: 'online', totalCents: 4000, refundStatus: 'none' },
        { channel: 'online', totalCents: 3000, refundStatus: 'refunded' },
        { channel: 'online', totalCents: 1000, refundStatus: 'pending' },
      ],
      offlineRevenueCents: 2500,
    })

    // 4000 + 1000 kept (a pending refund is still money in hand), 3000 gone.
    expect(out.onlineNetCents).toBe(5000)
    expect(out.offlineCents).toBe(2500)
    expect(out.collectedCents).toBe(7500)
  })

  it('leaves a partner sale out: that money is a receivable, not collected', () => {
    // A partner order stores `total` at FACE VALUE even though the society has
    // not seen a cent of it, so counting it here would put the same euros in
    // both cards and make the sum ADR-0015 forbids come out right.
    const out = seasonMoney({
      orders: [
        { channel: 'online', totalCents: 4000, refundStatus: 'none' },
        { channel: 'partner', totalCents: 6000, refundStatus: 'none' },
      ],
      offlineRevenueCents: 0,
    })

    expect(out.onlineNetCents).toBe(4000)
    expect(out.collectedCents).toBe(4000)
  })

  it('leaves a storno out too, which no refund status would have caught', () => {
    // A storno voids the TICKETS and touches neither `total` nor
    // `refund_status`, so a cancelled partner sale looks like live revenue
    // forever unless the channel itself is excluded.
    const out = seasonMoney({
      orders: [
        { channel: 'partner', totalCents: 6000, refundStatus: 'none' },
        { channel: 'comp', totalCents: 0, refundStatus: 'none' },
      ],
      offlineRevenueCents: 0,
    })

    expect(out.collectedCents).toBe(0)
    expect(out.refundCount).toBe(0)
  })

  it('counts refunded orders and what went back with them', () => {
    const out = seasonMoney({
      orders: [
        { channel: 'online', totalCents: 4000, refundStatus: 'refunded' },
        { channel: 'online', totalCents: 2000, refundStatus: 'refunded' },
        { channel: 'online', totalCents: 6000, refundStatus: 'none' },
        { channel: 'online', totalCents: 500, refundStatus: 'failed' },
        // A refunded partner order is not a refund of collected money either.
        { channel: 'partner', totalCents: 9900, refundStatus: 'refunded' },
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

const KALETA = { id: '1', name: 'Kaleta', commissionPercent: 10, active: true }
const AMINESS = { id: '2', name: 'Aminess', commissionPercent: 15, active: true }
const MARCO = { id: '3', name: 'Marco Polo', commissionPercent: 10, active: true }

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

  it('carries the partner’s active flag onto its row', () => {
    const retired = { ...AMINESS, active: false }
    const out = partnerReceivable(
      [retired],
      [{ partnerId: '2', type: 'adult', status: 'active' }],
    )
    expect(out.rows[0]).toMatchObject({ partnerName: 'Aminess', active: false, netCents: 1700 })
  })
})

const ROW = (partner: typeof KALETA) =>
  ({ partnerId: partner.id, type: 'adult', status: 'active', partner }) as const

describe('partnersInvolved', () => {
  it('finds a partner that only the rows know about', () => {
    // The season receivable must be derived from the SALES, never from the
    // list of partners who may still sell: a reseller deactivated in August
    // still owes for what it sold in July, and taking the list first would
    // make that debt vanish from the total.
    const retired = { ...AMINESS, active: false }
    expect(partnersInvolved([], [ROW(retired)])).toEqual([retired])
  })

  it('keeps a known partner that sold nothing, and adds one that did', () => {
    const retired = { ...AMINESS, active: false }
    expect(partnersInvolved([KALETA, MARCO], [ROW(retired)])).toEqual([retired, KALETA, MARCO])
  })

  it('lists a partner once, however many rows it has', () => {
    expect(partnersInvolved([KALETA], [ROW(KALETA), ROW(KALETA)])).toEqual([KALETA])
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

  it('reads an empty parameter as absent, not as January', () => {
    // `Number('')` is 0, which would clamp to month 1 and look like a choice.
    expect(resolveReceivableMonth(NOW, '', '')).toEqual(NOW)
    expect(resolveReceivableMonth(NOW, '2025', '')).toEqual({ year: 2025, month: 12 })
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

describe('promoRevenue', () => {
  it('lists only the codes that sold, biggest earner first', () => {
    const out = promoRevenue([
      { code: 'IVA', memberName: 'Iva Gamulin', ticketsSold: 4, revenueCents: 7000 },
      { code: 'ZERO', memberName: 'Nitko', ticketsSold: 0, revenueCents: 0 },
      { code: 'MARKO', memberName: 'Marko Šeparović', ticketsSold: 9, revenueCents: 15500 },
    ])

    expect(out.rows.map((r) => r.code)).toEqual(['MARKO', 'IVA'])
    expect(out.totalCents).toBe(22500)
    expect(out.ticketsSold).toBe(13)
  })

  it('is empty when no code has been used', () => {
    const out = promoRevenue([{ code: 'ZERO', memberName: '', ticketsSold: 0, revenueCents: 0 }])
    expect(out.rows).toEqual([])
    expect(out.totalCents).toBe(0)
  })
})
