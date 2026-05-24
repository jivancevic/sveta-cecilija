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
    return { refunded: false, amountCents: order.total }
  }
  if (!order.stripePaymentIntentId) throw new Error('Order has no Stripe payment intent')

  await deps.refundViaStripe({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: order.total,
  })
  await deps.markRefunded(order.id)
  await deps.sendRefundEmail({
    orderId: order.id,
    buyer: { name: order.buyerName, email: order.email },
    amountCents: order.total,
    show: order.show,
  })

  return { refunded: true, amountCents: order.total }
}
