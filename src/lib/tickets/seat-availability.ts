// Remaining capacity for a show, derived from per-person ticket rows.
//
// Per ADR-0007/0008 the `onlineSold` counter is retired: online seats are now
// counted as active `tickets` rows. `inPersonSold` and `legacyReserved` stay as
// counters — they represent seats that have no `tickets` rows (cash at the door,
// holdovers from the old WordPress site). So:
//
//   remaining = capacity − COUNT(active tickets) − inPersonSold − legacyReserved
//
// Capacity is always VENUE_CAPACITY[venue]; there is no per-show capacity field.

export interface SeatInputs {
  /** VENUE_CAPACITY[venue]. */
  capacity: number
  /** COUNT of active (non-cancelled) tickets for the show. */
  activeTicketCount: number
  /** Cash-at-the-door seats with no ticket rows. */
  inPersonSold: number
  /** Seats held by legacy WordPress buyers, no ticket rows. */
  legacyReserved: number
}

/** Seats still sellable. May be negative if a show is somehow oversold. */
export function remainingSeats(i: SeatInputs): number {
  return i.capacity - i.activeTicketCount - i.inPersonSold - i.legacyReserved
}

/**
 * Throws if selling `requested` more seats would exceed capacity. Callers must
 * pass a freshly-read `activeTicketCount` (ideally inside the same transaction
 * as the insert) for this to be race-safe.
 */
export function assertCanSell(i: SeatInputs, requested: number): void {
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new Error('Requested ticket count must be a positive integer')
  }
  const remaining = remainingSeats(i)
  if (requested > remaining) {
    throw new Error(
      `Cannot sell ${requested} ticket(s): only ${Math.max(0, remaining)} seat(s) remaining`,
    )
  }
}
