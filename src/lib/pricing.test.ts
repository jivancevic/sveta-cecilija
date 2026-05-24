import { describe, it, expect } from 'vitest'
import { calculateOrderTotal } from './pricing'

describe('calculateOrderTotal', () => {
  it('charges €20 per adult and €10 per child below the promo threshold', () => {
    expect(calculateOrderTotal({ adults: 2, children: 0 })).toMatchObject({
      subtotalEur: 40,
      discountEur: 0,
      totalEur: 40,
      totalCents: 4000,
    })
    expect(calculateOrderTotal({ adults: 1, children: 2 })).toMatchObject({
      subtotalEur: 40,
      discountEur: 0,
      totalEur: 40,
    })
  })

  it('discounts the 5th ticket at the adult price when any adult is in the order', () => {
    expect(calculateOrderTotal({ adults: 5, children: 0 })).toMatchObject({
      subtotalEur: 100,
      discountEur: 20,
      totalEur: 80,
    })
    expect(calculateOrderTotal({ adults: 4, children: 1 })).toMatchObject({
      subtotalEur: 90,
      discountEur: 20,
      totalEur: 70,
    })
  })

  it('discounts the 5th ticket at the child price when the order is all children', () => {
    expect(calculateOrderTotal({ adults: 0, children: 5 })).toMatchObject({
      subtotalEur: 50,
      discountEur: 10,
      totalEur: 40,
    })
  })

  it('compounds the discount across multiples of 5', () => {
    expect(calculateOrderTotal({ adults: 10, children: 0 })).toMatchObject({
      discountEur: 40,
      totalEur: 160,
    })
  })

  it('rejects non-integer or negative quantities', () => {
    expect(() => calculateOrderTotal({ adults: -1, children: 0 })).toThrow()
    expect(() => calculateOrderTotal({ adults: 1.5, children: 0 })).toThrow()
  })
})
