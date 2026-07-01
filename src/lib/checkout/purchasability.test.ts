import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { assertPurchasable, type PurchasableShow } from './purchasability'

// Pin the clock. Several cases build "today"/"tomorrow" shows and assert
// whether they're past the online-sale cutoff (start +1h, Europe/Zagreb). Left
// on the real wall clock those flip by time of day: a same-day 23:59 CEST show
// starts at 21:59 UTC, so any run after ~23:00 UTC saw it as already past and
// the suite went red (notably CI running at the midnight-UTC boundary). A fixed
// mid-season noon keeps every same-day evening show comfortably in the future
// and every early-morning show comfortably past, deterministically.
const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

// Fixed day after FIXED_NOW — a bare future date (no time) for capacity-only cases.
const tomorrow = '2026-06-16T00:00:00.000Z'

function baseShow(overrides: Partial<PurchasableShow> = {}): PurchasableShow {
  return {
    id: 'show_1',
    date: tomorrow,
    venue: 'ljetno-kino',
    activeTicketCount: 0,
    inPersonSold: 0,
    status: 'active',
    ...overrides,
  }
}

describe('assertPurchasable', () => {
  it('allows a purchase that fits within remaining capacity', () => {
    expect(() => assertPurchasable(baseShow(), { adults: 2, children: 1 })).not.toThrow()
  })

  it('rejects zero tickets', () => {
    expect(() => assertPurchasable(baseShow(), { adults: 0, children: 0 })).toThrow(/at least one/i)
  })

  it('rejects a cancelled show', () => {
    expect(() => assertPurchasable(baseShow({ status: 'cancelled' }), { adults: 1, children: 0 })).toThrow(/cancelled/i)
  })

  it('rejects a show that already started', () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    expect(() => assertPurchasable(baseShow({ date: past }), { adults: 1, children: 0 })).toThrow(/past/i)
  })

  it('does not treat a same-day evening show as past from its UTC midnight', () => {
    // Regression: `date` is a dayOnly value at midnight UTC. Earlier in the day
    // (any tz where local time > 00:00 UTC) that midnight is already in the
    // past, but the show's evening start time is still ahead. With `time` the
    // check must compare against the real Europe/Zagreb start, not midnight.
    const todayDay = new Date().toISOString().slice(0, 10)
    expect(() =>
      assertPurchasable(
        baseShow({ date: `${todayDay}T00:00:00.000Z`, time: '23:59' }),
        { adults: 1, children: 0 },
      ),
    ).not.toThrow()
  })

  it('rejects a same-day show whose start (+1h grace) has already passed', () => {
    // 00:01 local started just after midnight; well over an hour ago by any
    // time of day, so even with the grace window it is past.
    const todayDay = new Date().toISOString().slice(0, 10)
    expect(() =>
      assertPurchasable(
        baseShow({ date: `${todayDay}T00:00:00.000Z`, time: '00:01' }),
        { adults: 1, children: 0 },
      ),
    ).toThrow(/past/i)
  })

  it('rejects when requested quantity exceeds remaining capacity', () => {
    // ljetno-kino capacity = 320, activeTicketCount = 319 → remaining 1
    expect(() =>
      assertPurchasable(baseShow({ activeTicketCount: 319 }), { adults: 2, children: 0 }),
    ).toThrow(/capacity|remaining/i)
  })

  it('rejects when sold out', () => {
    expect(() =>
      assertPurchasable(baseShow({ activeTicketCount: 320 }), { adults: 1, children: 0 }),
    ).toThrow(/sold out|capacity|remaining/i)
  })

  it('counts both online and in-person sales against capacity', () => {
    expect(() =>
      assertPurchasable(baseShow({ activeTicketCount: 200, inPersonSold: 121 }), { adults: 1, children: 0 }),
    ).toThrow()
  })

  it('defaults legacyReserved to 0 when omitted (back-compat with pre-#60 callers)', () => {
    // ljetno-kino capacity = 320; sold = 319; legacy unset → remaining 1, 1 ticket allowed
    expect(() =>
      assertPurchasable(baseShow({ activeTicketCount: 319 }), { adults: 1, children: 0 }),
    ).not.toThrow()
  })

  it('subtracts legacyReserved from venue capacity', () => {
    // 320 − 0 − 0 − 100 = 220 remaining
    expect(() =>
      assertPurchasable(baseShow({ legacyReserved: 100 }), { adults: 220, children: 0 }),
    ).not.toThrow()
    expect(() =>
      assertPurchasable(baseShow({ legacyReserved: 100 }), { adults: 221, children: 0 }),
    ).toThrow(/capacity|remaining/i)
  })

  it('treats legacy + online + in-person == capacity as sold out', () => {
    expect(() =>
      assertPurchasable(
        baseShow({ activeTicketCount: 100, inPersonSold: 20, legacyReserved: 200 }),
        { adults: 1, children: 0 },
      ),
    ).toThrow(/capacity|remaining|sold out/i)
  })
})
