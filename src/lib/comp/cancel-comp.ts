// Admin comp cancellation (ADR-0019, #321). The free-ticket sibling of the
// partner storno: an admin voids a whole comp order or one comp ticket issued in
// error. There is no money to move (comps are total=0), so this reuses the single
// void primitive with reason='storno' ("cancelled, no money moved") — comp voids
// are distinguished from partner storno purely by channel='comp', so NO new
// cancel-reason enum value is introduced.
//
// Policy: admin-tier only, NO time window (the same-day rule is partner
// self-service, not an admin constraint) — the gate lives in the route via
// requirePermission. This module owns only the comp-scoping decision, kept pure + DI so
// it is unit-testable with fake void primitives:
//   - the order MUST exist and be a comp (channel='comp'); voiding a paid online
//     order here would cancel seats without a refund, and a partner order has its
//     own storno path, so both are rejected by construction;
//   - a single-ticket target MUST belong to the named order (defence against
//     pairing a foreign ticket id with a comp order id);
//   - a SCANNED ticket is never voided (#701): it is somebody who came in, and
//     voiding it would rewrite the evening's "ušlo X od Y" after the fact. A
//     single scanned ticket is refused (TICKET_SCANNED); a whole-order void
//     voids only the unscanned tickets, which the injected void owns in SQL
//     (`AND scanned = false`), so a ticket scanned between the check and the
//     UPDATE still stays active.
//
// The actual void is idempotent and race-safe (WHERE status='active'); because
// seats derive from active tickets, a successful cancel frees the seat and drops
// it from the per-show comp count automatically. A voided comp slip then scans to
// a clear CANCELLED dead-end (scan-token), never VALID.

export type CancelCompErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'NOT_A_COMP'
  | 'TICKET_NOT_IN_ORDER'
  | 'TICKET_SCANNED'
  | 'NOTHING_TO_VOID'

export class CancelCompError extends Error {
  constructor(
    public readonly code: CancelCompErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CancelCompError'
  }
}

export type CancelCompTarget = { kind: 'order' } | { kind: 'ticket'; ticketId: string }

export interface CancelCompOrder {
  channel: 'online' | 'partner' | 'comp'
}

export interface CancelCompInput {
  orderId: string
  /** Whole order, or a single ticket under it. */
  target: CancelCompTarget
}

export interface CancelCompDeps {
  loadOrder: (orderId: string) => Promise<CancelCompOrder | null>
  /** The order a ticket belongs to and whether it was scanned, or null if unknown. */
  loadTicket: (ticketId: string) => Promise<{ orderId: string; scanned: boolean } | null>
  /** Void all active UNSCANNED tickets of the order (reason=storno); count newly voided. */
  voidOrder: () => Promise<number>
  /** Void one active unscanned ticket (reason=storno); returns 0 or 1. */
  voidTicket: (ticketId: string) => Promise<number>
}

export interface CancelCompResult {
  voided: number
}

/**
 * Authorize (comp-scope only) and perform a comp cancellation. Returns how many
 * tickets were voided. Throws a typed CancelCompError:
 *   - ORDER_NOT_FOUND: no order with that id.
 *   - NOT_A_COMP: the order is online/partner — refuse (protects paid seats).
 *   - TICKET_NOT_IN_ORDER: single-ticket target not under this order.
 *   - TICKET_SCANNED: single-ticket target already scanned at the door.
 *   - NOTHING_TO_VOID: authorized, but no active ticket matched (already
 *     cancelled or unknown) — the route maps this to 409.
 */
export async function cancelComp(
  input: CancelCompInput,
  deps: CancelCompDeps,
): Promise<CancelCompResult> {
  const order = await deps.loadOrder(input.orderId)
  if (!order) {
    throw new CancelCompError('ORDER_NOT_FOUND', 'Order not found')
  }
  if (order.channel !== 'comp') {
    throw new CancelCompError('NOT_A_COMP', 'This order is not a comp')
  }

  if (input.target.kind === 'ticket') {
    const ticket = await deps.loadTicket(input.target.ticketId)
    if (ticket == null || String(ticket.orderId) !== String(input.orderId)) {
      throw new CancelCompError('TICKET_NOT_IN_ORDER', 'Ticket not found for this comp')
    }
    if (ticket.scanned) {
      throw new CancelCompError('TICKET_SCANNED', 'This ticket was scanned at the door and stays')
    }
  }

  const voided =
    input.target.kind === 'ticket'
      ? await deps.voidTicket(input.target.ticketId)
      : await deps.voidOrder()

  if (voided === 0) {
    throw new CancelCompError('NOTHING_TO_VOID', 'Nothing to cancel — these tickets are already cancelled')
  }

  return { voided }
}

export interface CompVoidCounts {
  /** Active, unscanned tickets: what a whole-order void would cancel. */
  voidable: number
  /** Active, scanned tickets: what a whole-order void leaves standing. */
  keptScanned: number
}

/**
 * What Poništi gratis would do to an order, counted the way the SQL does it
 * (#701): only an active, unscanned ticket is voided. Both screens that offer
 * the void read this, so the confirmation says the same numbers on each.
 */
export function compVoidCounts(
  tickets: ReadonlyArray<{ cancelled: boolean; scanned: boolean }>,
): CompVoidCounts {
  let voidable = 0
  let keptScanned = 0
  for (const t of tickets) {
    if (t.cancelled) continue
    if (t.scanned) keptScanned += 1
    else voidable += 1
  }
  return { voidable, keptScanned }
}
