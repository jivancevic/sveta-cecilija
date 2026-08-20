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
//   - Idempotency under Stripe's at-least-once (and concurrent) redelivery is
//     enforced by an atomic CLAIM on the critical-events ledger, not by a
//     read-then-write check. `claimEvent` does
//     `INSERT … ON CONFLICT DO NOTHING RETURNING id` against the partial unique
//     index on (kind, context->>'disputeId') (db/schema/app.sql), and we act
//     only if we won the insert. Two earlier shapes were rejected:
//       * check-then-act (`hasHandled` then `record`) — two deliveries racing
//         both read false and both alert;
//       * recording AFTER the work with `recordCriticalEvent` — that writer is
//         best-effort BY CONTRACT and swallows its own insert failure, so a
//         dropped ledger row silently leaves the event un-deduped forever.
//     `claimEvent` therefore must NOT swallow: if the ledger is unreachable we
//     want the route to 500 and Stripe to retry, not to act un-guarded.
//     `releaseEvent` is the compensating delete when the work then throws, so a
//     retry can redo it — same claim/release shape as the review-email cron.
//     The void itself is independently idempotent (it targets `status='active'`
//     rows only); the claim is what stops a duplicate admin alert.
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
  /**
   * Atomically claim this (kind, disputeId) pair by inserting its ledger row.
   * True when this caller won the insert and should do the work; false when a
   * row already existed (Stripe redelivery). MUST NOT swallow errors — a
   * failure here has to propagate so the route 500s and Stripe retries.
   */
  claimEvent: (kind: string, disputeId: string, context: Record<string, unknown>) => Promise<boolean>
  /**
   * Compensating delete for a claim whose work then threw, so a Stripe retry
   * can redo it. Best-effort: a failure here is logged, never rethrown, since
   * it would mask the original error.
   */
  releaseEvent: (kind: string, disputeId: string) => Promise<void>
  /**
   * Enrich the claimed row once the work is done (orderId, ticketsVoided, …).
   * Best-effort: the money and the tickets are already correct by this point,
   * so losing the detail is cosmetic and must not fail the request.
   */
  finalizeEvent: (kind: string, disputeId: string, context: Record<string, unknown>) => Promise<void>
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

  const base = {
    disputeId: evt.disputeId,
    paymentIntentId: evt.paymentIntentId,
    amountCents: evt.amountCents,
    currency: evt.currency,
    reason: evt.reason,
    status: evt.status,
    evidenceDueBy: evt.evidenceDueBy,
  }

  // Atomic claim, not a read-then-check: winning the INSERT is what grants the
  // right to act. A redelivery (or a concurrent one) loses it and no-ops.
  if (!(await deps.claimEvent(kind, evt.disputeId, base))) return { action: 'duplicate', kind }

  try {
    const order = evt.paymentIntentId
      ? await deps.findOrderByPaymentIntent(evt.paymentIntentId)
      : null
    const identified = { orderId: order?.id ?? null, orderCode: order?.code ?? null }

    if (kind === DISPUTE_CREATED) {
      // If the mail throws we release the claim below, so Stripe's retry gets a
      // real second attempt rather than hitting a claim with no alert behind it.
      await deps.notifyAdmins({ ...base, order })
      await deps.finalizeEvent(kind, evt.disputeId, { ...base, ...identified })
      return { action: 'alerted', kind, orderId: identified.orderId }
    }

    if (kind === DISPUTE_WON) {
      // Money stays with us; the order and its tickets are untouched.
      await deps.finalizeEvent(kind, evt.disputeId, { ...base, ...identified })
      return { action: 'noop', reason: 'dispute won; order left intact' }
    }

    // DISPUTE_LOST — funds are already gone at Stripe. Bookkeeping only.
    if (!order) {
      await deps.finalizeEvent(kind, evt.disputeId, { ...base, ...identified, matched: false })
      return { action: 'noop', reason: 'no order matches the disputed payment intent' }
    }

    // Skip the redundant write when a refund already marked it; still void, so a
    // dispute that follows a partially-applied refund self-heals the seats.
    if (order.refundStatus !== 'refunded') await deps.markRefunded(order.id)
    const voided = await deps.voidTickets(order.id)

    await deps.finalizeEvent(kind, evt.disputeId, { ...base, ...identified, ticketsVoided: voided })
    return { action: 'order_voided', kind, orderId: order.id, voided }
  } catch (err) {
    // Hand the claim back so the retry is a real attempt. Deliberately not
    // rethrown from here: a failing release must not mask the original error.
    try {
      await deps.releaseEvent(kind, evt.disputeId)
    } catch (releaseErr) {
      console.error(
        `[handleDisputeEvent] releaseEvent failed kind=${kind} disputeId=${evt.disputeId} error=${
          releaseErr instanceof Error ? releaseErr.message : String(releaseErr)
        }`,
      )
    }
    throw err
  }
}
