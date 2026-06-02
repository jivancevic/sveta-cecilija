import type { Venue } from './venues'

export interface RefundOrderInput {
  orderId: string
}

export interface RefundOrderRecord {
  id: string
  buyerName: string
  email: string
  total: number
  stripePaymentIntentId: string | null
  refundStatus: 'none' | 'refunded'
  show: { id: string; date: string; time: string; venue: Venue }
}

export interface SendRefundEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  amountCents: number
  show: { date: string; time: string; venue: Venue }
}

export interface RefundOrderDeps {
  getOrder: (orderId: string) => Promise<RefundOrderRecord | null>
  refundViaStripe: (args: { paymentIntentId: string; amountCents: number }) => Promise<{ id: string }>
  markRefunded: (orderId: string) => Promise<void>
  // Cascade-voids the order's active tickets (reason=refund) so refunded seats
  // free themselves (seats derive from active tickets, ADR-0008). Idempotent.
  voidTickets: (orderId: string) => Promise<number>
  sendRefundEmail: (input: SendRefundEmailInput) => Promise<void>
}

export interface RefundOrderResult {
  refunded: boolean
  amountCents: number
}

export async function refundOrder(
  input: RefundOrderInput,
  deps: RefundOrderDeps,
): Promise<RefundOrderResult> {
  const order = await deps.getOrder(input.orderId)
  if (!order) throw new Error('Order not found')
  if (order.refundStatus === 'refunded') {
    // Self-heal a stuck void (#169). A prior refund may have refunded at Stripe
    // and marked the order refunded, then thrown before voiding the tickets —
    // leaving refunded-but-active tickets that still occupy a seat and scan
    // VALID at the door. Re-void here so a retry frees them. Idempotent: the
    // void targets only active rows (0 when already cancelled). No Stripe call,
    // no re-email — the money is already back and the buyer already notified.
    await deps.voidTickets(order.id)
    return { refunded: false, amountCents: order.total }
  }
  if (!order.stripePaymentIntentId) throw new Error('Order has no Stripe payment intent')

  await deps.refundViaStripe({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: order.total,
  })
  await deps.markRefunded(order.id)
  // Free the seats: void all of the order's active tickets (reason=refund).
  await deps.voidTickets(order.id)
  await deps.sendRefundEmail({
    orderId: order.id,
    buyer: { name: order.buyerName, email: order.email },
    amountCents: order.total,
    show: order.show,
  })

  return { refunded: true, amountCents: order.total }
}
