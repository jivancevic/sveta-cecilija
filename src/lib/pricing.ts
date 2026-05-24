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
}

// Static 5-for-4 promo: every 5 tickets, one is free. The free ticket is
// valued at the adult price if any adult is in the order, otherwise the
// child price.
export function calculateOrderTotal({ adults, children }: OrderQuantities): OrderTotal {
  if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 0 || children < 0) {
    throw new Error('Ticket quantities must be non-negative integers')
  }

  const total = adults + children
  const subtotalEur = adults * ADULT_PRICE_EUR + children * CHILD_PRICE_EUR
  const freeTickets = Math.floor(total / 5)
  const freeTicketValue = adults > 0 ? ADULT_PRICE_EUR : CHILD_PRICE_EUR
  const discountEur = freeTickets * freeTicketValue
  const totalEur = subtotalEur - discountEur

  return {
    adults,
    children,
    subtotalEur,
    discountEur,
    totalEur,
    totalCents: totalEur * 100,
  }
}
