// Purchasability: is this a valid *online* ticket purchase right now?
//
// Distinct from the partner sell flow, which has its own rules (active upcoming
// show, positive counts) in create-partner-sale.ts. An online purchase is valid
// when the order is non-empty, the show is active and still in the future, and
// the requested seats fit the live remaining capacity.
//
// Seat math is delegated to the canonical seat-availability seam
// (src/lib/tickets/seat-availability.ts) — this module owns only the
// online-checkout-specific rules and their typed error modes.
import { VENUE_CAPACITY, type Venue } from '../venues'
import { assertCanSell, remainingSeats } from '../tickets/seat-availability'
import { buildStartDate } from '../event-jsonld'

export interface PurchasableShow {
  id: string
  date: string
  /**
   * Show start time as `HH:MM` (24h), Europe/Zagreb wall clock. The `date`
   * field is a Payload `dayOnly` value stored at midnight UTC, so on its own it
   * makes a show look "past" for the whole calendar day. We combine date+time
   * to get the real start instant. Optional for back-compat with callers/tests
   * that only assert capacity rules (they fall back to the bare date).
   */
  time?: string
  venue: Venue
  /**
   * Live COUNT of active (non-cancelled) tickets for the show. The
   * `shows.online_sold` counter is retired (ADR-0007/0008) — callers pass the
   * freshly-read ticket count from sold-seats.ts, never the stored column.
   */
  activeTicketCount: number
  inPersonSold: number
  /**
   * Tickets sold on the old WordPress site before cutover. Subtracted from
   * venue capacity so we can't oversell against legacy holders. Optional for
   * call-site convenience (older callers default to 0); always passed in
   * production paths after #60.
   */
  legacyReserved?: number
  status: 'active' | 'cancelled'
}

export class CheckoutValidationError extends Error {
  code: 'EMPTY' | 'CANCELLED' | 'PAST' | 'OVER_CAPACITY'
  constructor(code: 'EMPTY' | 'CANCELLED' | 'PAST' | 'OVER_CAPACITY', message: string) {
    super(message)
    this.code = code
  }
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
  // Combine the dayOnly date with the show's local start time so a show stays
  // purchasable right up to its Korčula (Europe/Zagreb) start, not from the
  // previous UTC midnight. `buildStartDate` applies the summer-season +02:00
  // offset; off-season shows don't run, so that's exact for every ticketed show.
  const showStart = show.time ? new Date(buildStartDate(show.date, show.time)) : new Date(show.date)
  if (showStart.getTime() < Date.now()) {
    throw new CheckoutValidationError('PAST', 'This show is in the past')
  }

  // Capacity is the shared seat-availability concern. Delegate the check, then
  // translate its plain Error into the typed OVER_CAPACITY mode so the checkout
  // guard's error contract stays intact.
  const seats = {
    capacity: VENUE_CAPACITY[show.venue],
    activeTicketCount: show.activeTicketCount,
    inPersonSold: show.inPersonSold,
    legacyReserved: show.legacyReserved ?? 0,
  }
  try {
    assertCanSell(seats, total)
  } catch {
    throw new CheckoutValidationError(
      'OVER_CAPACITY',
      `Only ${Math.max(0, remainingSeats(seats))} seats remaining for this show`,
    )
  }
}
