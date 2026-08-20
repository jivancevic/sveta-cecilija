// Stripe dispute (chargeback) lifecycle (#380).
//
// Before this existed the webhook early-returned on everything except
// `payment_intent.succeeded`, so a chargeback was invisible: nobody was told a
// dispute had been opened (the evidence deadline was only discoverable by
// logging into Stripe), and once a dispute was LOST the money was gone while the
// order still read `refundStatus='none'` with its tickets `active` — still
// occupying a seat and still scanning VALID at the door. Real incident
// 2026-08-20 (order 659), cleaned up by hand in prod.
//
// Pure + DI like the rest of the webhook seam, so it's unit-testable without
// Stripe, Payload or Brevo. Deliberate design points:
//
//   - A lost dispute does NOT call Stripe. The funds already moved when the
//     dispute was decided (`is_charge_refundable` is false by then), so calling
//     the refund engine would either error or double-refund. We mirror only the
//     BOOKKEEPING half of `refundOrder`'s already-refunded self-heal branch:
//     mark refunded, then cascade-void the tickets. No buyer email either — the
//     card network / PayPal already told them.
//   - `refundStatus` reuses the existing `refunded` value rather than gaining a
//     `disputed`/`charged_back` one. It is a drift-gate enum column
//     (db/schema/00-base.sql) and `refunded` already means exactly what the door
//     and the revenue reports need: money not ours, seat freed, QR dead. The
//     accounting distinction lives in the `critical_events` row instead, which
//     keeps the dispute id, reason and amount.
//   - Idempotency under Stripe's at-least-once (and out-of-order) redelivery is
//     enforced by `hasHandled(kind, disputeId)`, backed by the critical-events
//     ledger. The void itself is already idempotent (it targets `status='active'`
//     rows only); the guard additionally stops a duplicate admin alert.
//   - An event we can't act on (unknown payment intent, `warning_closed`,
//     `charge_refunded`) resolves to a no-op result, never a throw, so the route
//     can 200 and Stripe stops retrying something retries cannot fix.

export type DisputeEventType = 'charge.dispute.created' | 'charge.dispute.closed'

/** critical_events.kind values written by this module. */
export const DISPUTE_CREATED = 'stripe_dispute_created'
export const DISPUTE_LOST = 'stripe_dispute_lost'
export const DISPUTE_WON = 'stripe_dispute_won'

export interface DisputeEvent {
  type: DisputeEventType
  disputeId: string
  /** Null when Stripe gave us no payment intent (very old charges). */
  paymentIntentId: string | null
  /** Disputed amount in cents, as Stripe reports it. */
  amountCents: number
  currency: string
  /** Stripe dispute reason, e.g. `product_not_received`. */
  reason: string
  /** Stripe dispute status, e.g. `needs_response`, `won`, `lost`. */
  status: string
  /** ISO 8601 UTC evidence deadline (`evidence_details.due_by`), or null. */
  evidenceDueBy: string | null
}

export interface DisputedOrder {
  id: string
  code: string | null
  buyerName: string | null
  email: string | null
  /** Order total in cents. */
  total: number
  refundStatus: 'none' | 'refunded'
}

export interface DisputeNotificationInput {
  disputeId: string
  paymentIntentId: string | null
  amountCents: number
  currency: string
  reason: string
  status: string
  evidenceDueBy: string | null
  /** Null when no order matches the payment intent — still worth an alert. */
  order: DisputedOrder | null
}

export interface HandleDisputeDeps {
  findOrderByPaymentIntent: (paymentIntentId: string) => Promise<DisputedOrder | null>
  markRefunded: (orderId: string) => Promise<void>
  /** Cascade-void the order's active tickets (reason=refund). Returns how many. */
  voidTickets: (orderId: string) => Promise<number>
  notifyAdmins: (input: DisputeNotificationInput) => Promise<void>
  /** True when this exact (kind, disputeId) pair was already recorded. */
  hasHandled: (kind: string, disputeId: string) => Promise<boolean>
  /** Append the audit row. Best-effort by contract; must not throw. */
  record: (kind: string, context: Record<string, unknown>) => Promise<void>
}

export type DisputeResult =
  /** Admins were alerted about a newly opened dispute. */
  | { action: 'alerted'; kind: string; orderId: string | null }
  /** Dispute lost: order marked refunded and its tickets cascade-voided. */
  | { action: 'order_voided'; kind: string; orderId: string; voided: number }
  /** Nothing to do (won, unmatched order, or a status we don't act on). */
  | { action: 'noop'; reason: string }
  /** Stripe redelivered an event we already handled. */
  | { action: 'duplicate'; kind: string }

interface StripeDisputeLike {
  id?: unknown
  amount?: unknown
  currency?: unknown
  reason?: unknown
  status?: unknown
  payment_intent?: unknown
  evidence_details?: { due_by?: unknown } | null
}

function idOf(v: unknown): string | null {
  if (typeof v === 'string' && v) return v
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
    return (v as { id: string }).id
  }
  return null
}

/**
 * Normalize a Stripe dispute object into the shape this module works with.
 * Tolerates the expandable fields Stripe may deliver either as an id string or
 * as a nested object, and converts `evidence_details.due_by` (unix seconds) to
 * an ISO timestamp.
 */
export function toDisputeEvent(type: DisputeEventType, obj: unknown): DisputeEvent {
  const d = (obj ?? {}) as StripeDisputeLike
  const dueBy = d.evidence_details?.due_by
  return {
    type,
    disputeId: idOf(d.id) ?? '',
    paymentIntentId: idOf(d.payment_intent),
    amountCents: typeof d.amount === 'number' ? d.amount : 0,
    currency: typeof d.currency === 'string' ? d.currency : 'eur',
    reason: typeof d.reason === 'string' ? d.reason : 'unknown',
    status: typeof d.status === 'string' ? d.status : 'unknown',
    evidenceDueBy:
      typeof dueBy === 'number' && Number.isFinite(dueBy)
        ? new Date(dueBy * 1000).toISOString()
        : null,
  }
}

/**
 * Which critical-events kind (and therefore which branch) an event maps to.
 * Null means "closed with a status we take no action on" — `warning_closed`
 * (an early-warning that never became a dispute) and `charge_refunded` (we
 * refunded through our own path, which already did the bookkeeping).
 */
function kindFor(evt: DisputeEvent): string | null {
  if (evt.type === 'charge.dispute.created') return DISPUTE_CREATED
  if (evt.status === 'lost') return DISPUTE_LOST
  if (evt.status === 'won') return DISPUTE_WON
  return null
}

export async function handleDisputeEvent(
  evt: DisputeEvent,
  deps: HandleDisputeDeps,
): Promise<DisputeResult> {
  const kind = kindFor(evt)
  if (!kind) return { action: 'noop', reason: `dispute closed as ${evt.status}; nothing to do` }
  if (!evt.disputeId) return { action: 'noop', reason: 'dispute event has no id' }

  // At-least-once redelivery guard. Cheap, and the only thing standing between
  // Stripe's retries and a duplicate admin alert.
  if (await deps.hasHandled(kind, evt.disputeId)) return { action: 'duplicate', kind }

  const order = evt.paymentIntentId
    ? await deps.findOrderByPaymentIntent(evt.paymentIntentId)
    : null

  const base = {
    disputeId: evt.disputeId,
    paymentIntentId: evt.paymentIntentId,
    amountCents: evt.amountCents,
    currency: evt.currency,
    reason: evt.reason,
    status: evt.status,
    evidenceDueBy: evt.evidenceDueBy,
  }

  if (kind === DISPUTE_CREATED) {
    // Alert first, record second: if the mail fails we'd rather throw (route
    // 500s, Stripe retries with backoff) than silently mark it handled.
    await deps.notifyAdmins({ ...base, order })
    await deps.record(kind, {
      ...base,
      orderId: order?.id ?? null,
      orderCode: order?.code ?? null,
    })
    return { action: 'alerted', kind, orderId: order?.id ?? null }
  }

  if (kind === DISPUTE_WON) {
    // Money stays with us; the order and its tickets are untouched.
    await deps.record(kind, { ...base, orderId: order?.id ?? null, orderCode: order?.code ?? null })
    return { action: 'noop', reason: 'dispute won; order left intact' }
  }

  // DISPUTE_LOST — funds are already gone at Stripe. Bookkeeping only.
  if (!order) {
    await deps.record(kind, { ...base, orderId: null, orderCode: null, matched: false })
    return { action: 'noop', reason: 'no order matches the disputed payment intent' }
  }

  // Skip the redundant write when a refund already marked it; still void, so a
  // dispute that follows a partially-applied refund self-heals the seats.
  if (order.refundStatus !== 'refunded') await deps.markRefunded(order.id)
  const voided = await deps.voidTickets(order.id)

  await deps.record(kind, {
    ...base,
    orderId: order.id,
    orderCode: order.code,
    ticketsVoided: voided,
  })
  return { action: 'order_voided', kind, orderId: order.id, voided }
}
