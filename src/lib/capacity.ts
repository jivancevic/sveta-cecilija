import { VENUE_CAPACITY, type Venue } from './venues'

export interface PurchasableShow {
  id: string
  date: string
  venue: Venue
  onlineSold: number
  inPersonSold: number
  status: 'active' | 'cancelled'
}

export class CheckoutValidationError extends Error {
  code: 'EMPTY' | 'CANCELLED' | 'PAST' | 'OVER_CAPACITY'
  constructor(code: 'EMPTY' | 'CANCELLED' | 'PAST' | 'OVER_CAPACITY', message: string) {
    super(message)
    this.code = code
  }
}

export function remainingSeats(show: PurchasableShow): number {
  return VENUE_CAPACITY[show.venue] - show.onlineSold - show.inPersonSold
}

export function assertPurchasable(
  show: PurchasableShow,
  qty: { adults: number; children: number },
): void {
  const total = qty.adults + qty.children
  if (total <= 0) {
    throw new CheckoutValidationError('EMPTY', 'Select at least one ticket')
  }
  if (show.status === 'cancelled') {
    throw new CheckoutValidationError('CANCELLED', 'This show has been cancelled')
  }
  const showStart = new Date(show.date)
  if (showStart.getTime() < Date.now()) {
    throw new CheckoutValidationError('PAST', 'This show is in the past')
  }
  const remaining = remainingSeats(show)
  if (total > remaining) {
    throw new CheckoutValidationError(
      'OVER_CAPACITY',
      `Only ${remaining} seats remaining for this show`,
    )
  }
}
