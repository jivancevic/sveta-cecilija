// Ticket-void primitive (ADR-0007/0008). Voiding sets status=cancelled,
// cancelled_at, cancel_reason on an order's still-active tickets. Idempotent:
// the void targets only active rows, so re-voiding an already-cancelled order
// is a no-op (returns 0). Because seats derive from active tickets, voiding
// frees the seats automatically.
//
// Pure + DI so it's unit-testable; the route wires atomicVoidActiveTickets to a
// race-safe raw UPDATE. Reused by the refund cascade (#142) and storno (#145).

export type CancelReason = 'storno' | 'refund'

export interface VoidTicketsDeps {
  /**
   * Atomically flips every still-active ticket of the order to cancelled with
   * the given reason, returning how many rows it voided. Filtering on
   * status='active' makes it idempotent and race-safe.
   */
  atomicVoidActiveTickets: (orderId: string, reason: CancelReason) => Promise<number>
}

export interface VoidTicketsResult {
  voided: number
}

/** Void all active tickets of an order. Returns how many were newly cancelled. */
export async function voidOrderTickets(
  orderId: string,
  reason: CancelReason,
  deps: VoidTicketsDeps,
): Promise<VoidTicketsResult> {
  const voided = await deps.atomicVoidActiveTickets(orderId, reason)
  return { voided }
}

export interface VoidSingleTicketDeps {
  /**
   * Atomically flips one still-active ticket to cancelled with the given reason,
   * returning how many rows it voided (1 on success, 0 if it was already
   * cancelled or does not exist). Filtering on status='active' makes it
   * idempotent and race-safe — the same single-ticket discipline as the order
   * variant, scoped to one ticket id.
   */
  atomicVoidActiveTicket: (ticketId: string, reason: CancelReason) => Promise<number>
}

/** Void a single active ticket. Returns how many were newly cancelled (0 or 1). */
export async function voidSingleTicket(
  ticketId: string,
  reason: CancelReason,
  deps: VoidSingleTicketDeps,
): Promise<VoidTicketsResult> {
  const voided = await deps.atomicVoidActiveTicket(ticketId, reason)
  return { voided }
}
