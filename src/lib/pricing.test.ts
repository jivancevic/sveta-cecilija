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

  it('reports no promo applied when no code is passed', () => {
    expect(calculateOrderTotal({ adults: 2, children: 0 }).promoApplied).toBe(false)
    expect(calculateOrderTotal({ adults: 2, children: 0 }, null).promoApplied).toBe(false)
  })

  describe('member promo code (best-of-two, ADR-0018)', () => {
    const code = { adultPriceEur: 15 }

    it('takes the code price when it beats the 5-for-4 offer (5-adult example)', () => {
      // min(5×15 = 75, 4×20 = 80) = 75.
      expect(calculateOrderTotal({ adults: 5, children: 0 }, code)).toMatchObject({
        subtotalEur: 100,
        totalEur: 75,
        discountEur: 25,
        promoApplied: true,
      })
    })

    it('overrides only the adult price; children stay €10', () => {
      // 2 adults + 3 children, no 5-for-4 (only 5 tickets: 2×15 + 3×10 = 60,
      // standard = 2×20 + 3×10 - 20 = 50). Standard wins here, code not applied.
      expect(calculateOrderTotal({ adults: 2, children: 3 }, code)).toMatchObject({
        totalEur: 50,
        promoApplied: false,
      })
      // 3 adults + 2 children: code = 3×15 + 2×10 = 65; standard = 3×20+2×10-20 = 60.
      expect(calculateOrderTotal({ adults: 3, children: 2 }, code)).toMatchObject({
        totalEur: 60,
        promoApplied: false,
      })
    })

    it('applies the code on small orders below the 5-for-4 threshold', () => {
      // 2 adults: code = 2×15 = 30 < standard 40.
      expect(calculateOrderTotal({ adults: 2, children: 0 }, code)).toMatchObject({
        totalEur: 30,
        discountEur: 10,
        promoApplied: true,
      })
    })

    it('never applies to a children-only order (adult override has no effect)', () => {
      // 5 children: code = 0×15 + 5×10 = 50; standard 5-for-4 = 40. Standard wins.
      expect(calculateOrderTotal({ adults: 0, children: 5 }, code)).toMatchObject({
        totalEur: 40,
        promoApplied: false,
      })
    })

    it('does not stack: never charges below the better of the two discounts', () => {
      // 10 adults: code = 10×15 = 150; standard = 200 - 2×20 = 160. Code wins 150.
      expect(calculateOrderTotal({ adults: 10, children: 0 }, code)).toMatchObject({
        totalEur: 150,
        promoApplied: true,
      })
    })

    it('keeps the standard price when the code is worse than 5-for-4', () => {
      // A weak code (€19 adult) on 5 adults: code = 95, standard = 80. Standard wins.
      expect(calculateOrderTotal({ adults: 5, children: 0 }, { adultPriceEur: 19 })).toMatchObject({
        totalEur: 80,
        promoApplied: false,
      })
    })

    it('mixed order where the code wins', () => {
      // 4 adults + 1 child: code = 4×15 + 10 = 70; standard = 4×20+10 - 20 = 70.
      // Tie -> code not strictly cheaper, standard kept (guest pays the same 70).
      expect(calculateOrderTotal({ adults: 4, children: 1 }, code)).toMatchObject({
        totalEur: 70,
        promoApplied: false,
      })
      // 6 adults: code = 90; standard = 120 - 20 = 100. Code wins.
      expect(calculateOrderTotal({ adults: 6, children: 0 }, code)).toMatchObject({
        totalEur: 90,
        promoApplied: true,
      })
    })
  })
})
