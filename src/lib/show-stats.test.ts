import { describe, it, expect } from 'vitest'
import {
  computeShowStats,
  type ShowStatsInput,
  type ShowStatsOrder,
} from './show-stats'
import type { StatsShow } from './stats'

function makeShow(overrides: Partial<StatsShow> = {}): StatsShow {
  return {
    id: 'show-1',
    date: '2026-07-01',
    time: '21:00',
    venue: 'ljetno-kino',
    activeTicketCount: 0,
    inPersonSold: 0,
    legacyReserved: 0,
    scannedCount: 0,
    status: 'active',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ShowStatsOrder> = {}): ShowStatsOrder {
  return {
    id: 'o1',
    buyerName: 'Ana Anić',
    email: 'ana@example.com',
    adultCount: 2,
    childCount: 0,
    totalCents: 4000,
    refunded: false,
    tokens: [],
    ...overrides,
  }
}

function makeInput(overrides: Partial<ShowStatsInput> = {}): ShowStatsInput {
  return {
    show: makeShow(),
    orders: [],
    ...overrides,
  }
}

describe('computeShowStats — header big numbers', () => {
  it('exposes per-show date, time, venue, status from the show input', () => {
    const out = computeShowStats(
      makeInput({
        show: makeShow({
          date: '2026-07-12',
          time: '21:30',
          venue: 'zimsko-kino',
          status: 'cancelled',
        }),
      }),
    )

    expect(out.header.date).toBe('2026-07-12')
    expect(out.header.time).toBe('21:30')
    expect(out.header.venue).toBe('zimsko-kino')
    expect(out.header.status).toBe('cancelled')
  })

  it('passes through onlineSold, inPersonSold and computes totalSold', () => {
    const out = computeShowStats(
      makeInput({
        show: makeShow({ activeTicketCount: 100, inPersonSold: 20 }),
      }),
    )

    expect(out.header.onlineSold).toBe(100)
    expect(out.header.inPersonSold).toBe(20)
    expect(out.header.totalSold).toBe(120)
  })

  it('breaks out comp seats, subtracts them from onlineSold, and keeps them out of revenue (#322, ADR-0019)', () => {
    const out = computeShowStats(
      makeInput({
        // 12 active tickets total (8 online + 4 comp), 3 in-person, 5 legacy.
        show: makeShow({
          venue: 'ljetno-kino',
          activeTicketCount: 12,
          inPersonSold: 3,
          legacyReserved: 5,
        }),
        orders: [
          makeOrder({
            id: 'online1',
            channel: 'online',
            totalCents: 16_000,
            tokens: [
              { token: 'a1', scanned: true, scannedAt: '2026-07-01T20:00:00Z' },
              { token: 'a2', scanned: true, scannedAt: '2026-07-01T20:01:00Z' },
              { token: 'a3', scanned: false, scannedAt: null },
              { token: 'a4', scanned: false, scannedAt: null },
              { token: 'a5', scanned: false, scannedAt: null },
              { token: 'a6', scanned: false, scannedAt: null },
              { token: 'a7', scanned: false, scannedAt: null },
              { token: 'a8', scanned: false, scannedAt: null },
            ],
          }),
          makeOrder({
            id: 'comp1',
            channel: 'comp',
            totalCents: 0,
            tokens: [
              { token: 'c1', scanned: true, scannedAt: '2026-07-01T20:05:00Z' },
              { token: 'c2', scanned: false, scannedAt: null },
              { token: 'c3', scanned: false, scannedAt: null },
              { token: 'c4', scanned: false, scannedAt: null },
            ],
          }),
        ],
      }),
    )

    expect(out.header.compSold).toBe(4)
    // onlineSold = activeTicketCount − comp = 12 − 4 = 8 (partner would stay folded in)
    expect(out.header.onlineSold).toBe(8)
    // Comps carry no money: revenue is the online order only.
    expect(out.header.revenueCents).toBe(16_000)
    // Comps are real people at the door: the scanned comp ticket counts.
    expect(out.header.scanned).toBe(3)
    // Seat math reconciles: online + inPerson + comp + legacy + remaining = capacity.
    const { onlineSold, inPersonSold, compSold, legacyReserved, remaining, capacity } = out.header
    expect(onlineSold + inPersonSold + compSold + legacyReserved + remaining).toBe(capacity)
  })

  it('treats an order with no channel as online (compSold stays 0)', () => {
    const out = computeShowStats(
      makeInput({
        show: makeShow({ activeTicketCount: 2 }),
        orders: [
          makeOrder({
            id: 'legacy',
            tokens: [
              { token: 'x1', scanned: false, scannedAt: null },
              { token: 'x2', scanned: false, scannedAt: null },
            ],
          }),
        ],
      }),
    )

    expect(out.header.compSold).toBe(0)
    expect(out.header.onlineSold).toBe(2)
  })

  it('counts scanned tickets (one per person), ignoring refund status', () => {
    // Per-person model (ADR-0007): each ticket is one person, so scanned is a
    // COUNT of scanned tickets — not a sum of party sizes when "any" is scanned.
    const out = computeShowStats(
      makeInput({
        orders: [
          makeOrder({
            // 2 adults + 1 child → 3 tickets; 2 scanned, 1 still outside
            adultCount: 2,
            childCount: 1,
            tokens: [
              { token: 't1', scanned: true, scannedAt: '2026-07-12T20:55:00Z' },
              { token: 't2', scanned: true, scannedAt: '2026-07-12T20:56:00Z' },
              { token: 't3', scanned: false, scannedAt: null },
            ],
          }),
          makeOrder({
            id: 'o2',
            // refunded but scanned: still walked in → counts
            adultCount: 1,
            childCount: 0,
            refunded: true,
            tokens: [{ token: 't4', scanned: true, scannedAt: '2026-07-12T21:00:00Z' }],
          }),
          makeOrder({
            id: 'o3',
            // unscanned order → not counted
            adultCount: 5,
            childCount: 0,
            tokens: [
              { token: 't5', scanned: false, scannedAt: null },
              { token: 't6', scanned: false, scannedAt: null },
            ],
          }),
        ],
      }),
    )

    // 2 (order 1) + 1 (order 2) + 0 (order 3) = 3 scanned tickets
    expect(out.header.scanned).toBe(3)
  })

  it('surfaces legacyReserved as its own header field and subtracts it from remaining', () => {
    const out = computeShowStats(
      makeInput({
        show: makeShow({
          venue: 'ljetno-kino',
          activeTicketCount: 100,
          inPersonSold: 20,
          legacyReserved: 50,
        }),
      }),
    )

    expect(out.header.legacyReserved).toBe(50)
    // 320 − 100 − 20 − 50 = 150
    expect(out.header.remaining).toBe(150)
  })

  it('renders remaining = 0 when legacy + online + in-person == capacity (sold-out boundary)', () => {
    const out = computeShowStats(
      makeInput({
        show: makeShow({
          venue: 'ljetno-kino',
          activeTicketCount: 100,
          inPersonSold: 20,
          legacyReserved: 200,
        }),
      }),
    )

    expect(out.header.remaining).toBe(0)
  })

  it('derives capacity per venue and remaining = capacity − onlineSold − inPersonSold', () => {
    const ljetno = computeShowStats(
      makeInput({ show: makeShow({ venue: 'ljetno-kino', activeTicketCount: 100, inPersonSold: 20 }) }),
    )
    const zimsko = computeShowStats(
      makeInput({ show: makeShow({ venue: 'zimsko-kino', activeTicketCount: 50, inPersonSold: 0 }) }),
    )

    expect(ljetno.header.capacity).toBe(320)
    expect(ljetno.header.remaining).toBe(200)
    expect(zimsko.header.capacity).toBe(250)
    expect(zimsko.header.remaining).toBe(200)
  })

  it('sums revenue across non-refunded orders only', () => {
    const out = computeShowStats(
      makeInput({
        orders: [
          makeOrder({ id: 'a', totalCents: 4000, refunded: false }),
          makeOrder({ id: 'b', totalCents: 6000, refunded: false }),
          makeOrder({ id: 'c', totalCents: 2000, refunded: true }),
        ],
      }),
    )

    expect(out.header.revenueCents).toBe(10_000)
  })
})

describe('computeShowStats — order list', () => {
  it('exposes per-order buyer name, email, and ticket count = adultCount + childCount', () => {
    const out = computeShowStats(
      makeInput({
        orders: [
          makeOrder({
            id: 'a',
            buyerName: 'Ana Anić',
            email: 'ana@example.com',
            adultCount: 2,
            childCount: 1,
          }),
        ],
      }),
    )

    expect(out.orders).toHaveLength(1)
    const o = out.orders[0]
    expect(o.id).toBe('a')
    expect(o.buyerName).toBe('Ana Anić')
    expect(o.email).toBe('ana@example.com')
    expect(o.ticketCount).toBe(3)
  })

  it('preserves per-token scanned state and scannedAt timestamps', () => {
    const out = computeShowStats(
      makeInput({
        orders: [
          makeOrder({
            tokens: [
              { token: 't1', scanned: true, scannedAt: '2026-07-12T20:55:00Z' },
              { token: 't2', scanned: false, scannedAt: null },
            ],
          }),
        ],
      }),
    )

    const tokens = out.orders[0].tokens
    expect(tokens).toEqual([
      { token: 't1', scanned: true, scannedAt: '2026-07-12T20:55:00Z' },
      { token: 't2', scanned: false, scannedAt: null },
    ])
  })

  it('flags refunded orders so the view can render them muted', () => {
    const out = computeShowStats(
      makeInput({
        orders: [
          makeOrder({ id: 'a', refunded: false }),
          makeOrder({ id: 'b', refunded: true }),
        ],
      }),
    )

    expect(out.orders.find((o) => o.id === 'a')!.refunded).toBe(false)
    expect(out.orders.find((o) => o.id === 'b')!.refunded).toBe(true)
  })
})
