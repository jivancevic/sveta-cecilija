// Shared resolution + eligibility for the self-serve reschedule refund (ADR-0021).
// Both the buyer PAGE (/order/[token]/refund, renders the right state) and the
// mutation ROUTE (POST /api/order/[token]/refund, enforces before refunding)
// call `resolveRescheduleRefund` so the two can never disagree about whether a
// refund is allowed. The token proves *identity*; every eligibility condition is
// re-derived from the DB here — never trusted from the client.

import { toIsoDate } from '../to-iso-date'
import type { Venue } from '../venues'
import { verifyRescheduleRefundToken } from './reschedule-refund-token'

export type RefundEligibility =
  | 'ELIGIBLE' // show was rescheduled, online, unscanned, not yet refunded → may self-refund
  | 'INVALID' // bad/forged token, or no such order
  | 'NOT_RESCHEDULED' // the order's show was never moved → no self-serve right (ADR-0021 scope)
  | 'NOT_ONLINE' // comp/partner order (no Stripe payment to reverse)
  | 'ALREADY_REFUNDED' // idempotent — already done
  | 'SCANNED' // at least one ticket already used at the door → consumed, no refund

export interface RefundOrderContext {
  order: {
    id: string
    code: string
    channel: 'online' | 'partner' | 'comp'
    refundStatus: 'none' | 'refunded'
    stripePaymentIntentId: string | null
    adultCount: number
    childCount: number
    total: number // EUR cents
    locale: 'en' | 'hr'
    buyerName: string
    email: string
    showId: string
  }
  show: { date: string; time: string; venue: Venue; rescheduled: boolean }
  /** COUNT of tickets on the order already scanned (any > 0 blocks the refund). */
  scannedCount: number
}

/**
 * Pure eligibility decision from an already-loaded context. Order of checks is
 * deliberate: reschedule scope first (the whole right exists only because we
 * moved the date), then channel, then the terminal already-done / consumed
 * states. There is intentionally NO time-window check — a no-show can still
 * refund; a scan is the only thing that closes the door (ADR-0021).
 */
export function evaluateRefundEligibility(ctx: RefundOrderContext): RefundEligibility {
  if (!ctx.show.rescheduled) return 'NOT_RESCHEDULED'
  if (ctx.order.channel !== 'online' || !ctx.order.stripePaymentIntentId) return 'NOT_ONLINE'
  if (ctx.order.refundStatus === 'refunded') return 'ALREADY_REFUNDED'
  if (ctx.scannedCount > 0) return 'SCANNED'
  return 'ELIGIBLE'
}

/** Minimal pg pool slice — matches how the reschedule route reads `payload.db.pool`. */
export interface RefundContextPool {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

/** Load the order + its show + scanned-ticket count. Returns null if no order. */
export async function loadRefundContext(
  orderId: string,
  pool: RefundContextPool,
): Promise<RefundOrderContext | null> {
  const res = await pool.query(
    `SELECT o.id, o.code, o.channel, o.refund_status, o.stripe_payment_intent_id,
            o.adult_count, o.child_count, o.total, o.locale, o.buyer_name, o.email, o.show_id,
            s.date AS show_date, s.time AS show_time, s.venue AS show_venue,
            s.date_changed_at AS date_changed_at,
            (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id AND t.scanned = true) AS scanned_count
     FROM orders o
     JOIN shows s ON s.id = o.show_id
     WHERE o.id = $1
     LIMIT 1`,
    [Number(orderId)],
  )
  const row = res.rows[0]
  if (!row) return null

  const channel = row.channel === 'partner' ? 'partner' : row.channel === 'comp' ? 'comp' : 'online'
  return {
    order: {
      id: String(row.id),
      code: String(row.code ?? ''),
      channel,
      refundStatus: row.refund_status === 'refunded' ? 'refunded' : 'none',
      stripePaymentIntentId: (row.stripe_payment_intent_id as string) ?? null,
      adultCount: Number(row.adult_count ?? 0),
      childCount: Number(row.child_count ?? 0),
      total: Number(row.total ?? 0),
      locale: row.locale === 'hr' ? 'hr' : 'en',
      buyerName: String(row.buyer_name ?? ''),
      email: String(row.email ?? ''),
      showId: String(row.show_id),
    },
    show: {
      date: toIsoDate(row.show_date),
      time: String(row.show_time ?? ''),
      venue: row.show_venue === 'zimsko-kino' ? 'zimsko-kino' : 'ljetno-kino',
      rescheduled: row.date_changed_at != null,
    },
    scannedCount: Number(row.scanned_count ?? 0),
  }
}

export interface ResolvedRescheduleRefund {
  state: RefundEligibility
  /** Present whenever the order was found (even if not eligible), for the page to render. */
  ctx: RefundOrderContext | null
}

/**
 * End-to-end resolution used by both the page and the route: verify the token,
 * load the order, evaluate eligibility. INVALID covers both a bad/forged token
 * and a token for an order that no longer exists.
 */
export async function resolveRescheduleRefund(
  token: string,
  secret: string,
  pool: RefundContextPool,
): Promise<ResolvedRescheduleRefund> {
  const orderId = verifyRescheduleRefundToken(token, secret)
  if (!orderId) return { state: 'INVALID', ctx: null }
  const ctx = await loadRefundContext(orderId, pool)
  if (!ctx) return { state: 'INVALID', ctx: null }
  return { state: evaluateRefundEligibility(ctx), ctx }
}
