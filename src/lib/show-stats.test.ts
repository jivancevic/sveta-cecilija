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
    onlineSold: 0,
    inPersonSold: 0,
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
        show: makeShow({ onlineSold: 100, inPersonSold: 20 }),
      }),
    )

    expect(out.header.onlineSold).toBe(100)
    expect(out.header.inPersonSold).toBe(20)
    expect(out.header.totalSold).toBe(120)
  })

  it('counts scanned tokens across all orders (ignores refund status)', () => {
    const out = computeShowStats(
      makeInput({
        orders: [
          makeOrder({
            tokens: [
              { token: 't1', scanned: true, scannedAt: '2026-07-12T20:55:00Z' },
              { token: 't2', scanned: false, scannedAt: null },
            ],
          }),
          makeOrder({
            id: 'o2',
            refunded: true,
            tokens: [{ token: 't3', scanned: true, scannedAt: '2026-07-12T21:00:00Z' }],
          }),
        ],
      }),
    )

    expect(out.header.scanned).toBe(2)
  })

  it('derives capacity per venue and remaining = capacity − onlineSold − inPersonSold', () => {
    const ljetno = computeShowStats(
      makeInput({ show: makeShow({ venue: 'ljetno-kino', onlineSold: 100, inPersonSold: 20 }) }),
    )
    const zimsko = computeShowStats(
      makeInput({ show: makeShow({ venue: 'zimsko-kino', onlineSold: 50, inPersonSold: 0 }) }),
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
