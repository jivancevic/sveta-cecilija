// Ticket-void primitive (ADR-0007/0008). Voiding sets status=cancelled,
// cancelled_at, cancel_reason on still-active tickets. Idempotent and race-safe:
// the UPDATE targets only `status = 'active'` rows, so re-voiding an already-
// cancelled order/ticket is a no-op (returns 0) and concurrent callers can't
// double-void. Because seats derive from active tickets, voiding frees the seats
// automatically.
//
// This module OWNS the void SQL (single source of truth) — callers inject only a
// generic SQL executor (the postgres adapter's `drizzle` handle), never the
// statement itself. That keeps the atomicity guarantee in one place while
// staying unit-testable with a fake executor. The end-to-end seat-freeing is
// regression-checked by scripts/probe-refund-void.mjs. Reused by the refund
// cascade (#142) and storno (#145).
import { sql } from '@payloadcms/db-postgres'

export type CancelReason = 'storno' | 'refund'

/**
 * The drizzle executor exposed at `payload.db.drizzle`. Only `execute` is used;
 * inject it so this module owns the void SQL and the route stays a thin adapter.
 * `execute` may return `{ rows }` or a bare array depending on the driver path.
 */
export interface TicketVoidExecutor {
  execute: (query: unknown) => Promise<{ rows?: unknown[] } | unknown[]>
}

export interface VoidTicketsResult {
  voided: number
}

function rowsOf(res: { rows?: unknown[] } | unknown[]): unknown[] {
  return Array.isArray(res) ? res : (res.rows ?? [])
}

/** Void all active tickets of an order. Returns how many were newly cancelled. */
export async function voidOrderTickets(
  db: TicketVoidExecutor,
  orderId: string,
  reason: CancelReason,
): Promise<VoidTicketsResult> {
  const res = await db.execute(sql`
    UPDATE tickets
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancel_reason = ${reason},
        updated_at = NOW()
    WHERE order_id = ${Number(orderId)} AND status = 'active'
    RETURNING id
  `)
  return { voided: rowsOf(res).length }
}

/** Void a single active ticket. Returns how many were newly cancelled (0 or 1). */
export async function voidSingleTicket(
  db: TicketVoidExecutor,
  ticketId: string,
  reason: CancelReason,
): Promise<VoidTicketsResult> {
  const res = await db.execute(sql`
    UPDATE tickets
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancel_reason = ${reason},
        updated_at = NOW()
    WHERE id = ${Number(ticketId)} AND status = 'active'
    RETURNING id
  `)
  return { voided: rowsOf(res).length }
}
