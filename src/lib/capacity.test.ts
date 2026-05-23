import { describe, it, expect } from 'vitest'
import { assertPurchasable, type PurchasableShow } from './capacity'

const today = new Date()
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

function baseShow(overrides: Partial<PurchasableShow> = {}): PurchasableShow {
  return {
    id: 'show_1',
    date: tomorrow,
    venue: 'ljetno-kino',
    onlineSold: 0,
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

  it('rejects when requested quantity exceeds remaining capacity', () => {
    // ljetno-kino capacity = 320, onlineSold = 319 → remaining 1
    expect(() =>
      assertPurchasable(baseShow({ onlineSold: 319 }), { adults: 2, children: 0 }),
    ).toThrow(/capacity|remaining/i)
  })

  it('rejects when sold out', () => {
    expect(() =>
      assertPurchasable(baseShow({ onlineSold: 320 }), { adults: 1, children: 0 }),
    ).toThrow(/sold out|capacity|remaining/i)
  })

  it('counts both online and in-person sales against capacity', () => {
    expect(() =>
      assertPurchasable(baseShow({ onlineSold: 200, inPersonSold: 121 }), { adults: 1, children: 0 }),
    ).toThrow()
  })
})
