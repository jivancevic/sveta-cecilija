export const ADULT_PRICE_EUR = 20
export const CHILD_PRICE_EUR = 10

export interface OrderQuantities {
  adults: number
  children: number
}

export interface OrderTotal {
  adults: number
  children: number
  subtotalEur: number
  discountEur: number
  totalEur: number
  totalCents: number
  /** True when a member promo code beat the standard 5-for-4 price. */
  promoApplied: boolean
}

// A member promo code (ADR-0018): overrides the adult ticket price only; the
// child price is never changed. This is the sole server-side exception to the
// fixed €20/€10 prices.
export interface PromoCodePricing {
  adultPriceEur: number
}

// Static 5-for-4 promo: every 5 tickets, one is free. The free ticket is
// valued at the adult price if any adult is in the order, otherwise the
// child price.
//
// A member promo code (ADR-0018) may override the adult price. The two discounts
// NEVER stack: the guest pays the LOWER of (standard 5-for-4 total) vs (the code
// price, where each adult costs `adultPriceEur` and children stay €10). Example:
// 5 adults + a €15 code = min(5×15=75, 4×20=80) = 75.
export function calculateOrderTotal(
  { adults, children }: OrderQuantities,
  promo?: PromoCodePricing | null,
): OrderTotal {
  if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 0 || children < 0) {
    throw new Error('Ticket quantities must be non-negative integers')
  }

  const total = adults + children
  const subtotalEur = adults * ADULT_PRICE_EUR + children * CHILD_PRICE_EUR
  const freeTickets = Math.floor(total / 5)
  const freeTicketValue = adults > 0 ? ADULT_PRICE_EUR : CHILD_PRICE_EUR
  const standardTotalEur = subtotalEur - freeTickets * freeTicketValue

  let totalEur = standardTotalEur
  let promoApplied = false
  if (promo) {
    const promoTotalEur = adults * promo.adultPriceEur + children * CHILD_PRICE_EUR
    // Best-of-two: the code only wins when it is strictly cheaper than the
    // automatic 5-for-4 offer, so the guest is never worse off than the public
    // price and the two discounts don't compound.
    if (promoTotalEur < standardTotalEur) {
      totalEur = promoTotalEur
      promoApplied = true
    }
  }

  return {
    adults,
    children,
    subtotalEur,
    discountEur: subtotalEur - totalEur,
    totalEur,
    totalCents: totalEur * 100,
    promoApplied,
  }
}
