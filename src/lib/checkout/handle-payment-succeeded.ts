import type { PurchasableShow } from '../capacity'

export interface PaymentSucceededEvent {
  paymentIntentId: string
  amountReceived: number
  metadata: Record<string, string | undefined>
}

export interface CreateOrderInput {
  buyerName: string
  email: string
  adultCount: number
  childCount: number
  total: number
  stripePaymentIntentId: string
  refundStatus: 'none'
  show: string
}

export interface PaymentSucceededDeps {
  findOrderByPaymentIntent: (id: string) => Promise<{ id: string } | null>
  findShow: (id: string) => Promise<PurchasableShow | null>
  createOrder: (input: CreateOrderInput) => Promise<{ id: string }>
  createQrToken: (input: { token: string; order: string }) => Promise<void>
  incrementOnlineSold: (showId: string, by: number) => Promise<void>
  generateToken: () => string
}

export async function handlePaymentSucceeded(
  evt: PaymentSucceededEvent,
  deps: PaymentSucceededDeps,
): Promise<{ orderId: string | null; skipped: boolean }> {
  const existing = await deps.findOrderByPaymentIntent(evt.paymentIntentId)
  if (existing) return { orderId: existing.id, skipped: true }

  const showId = evt.metadata.showId
  if (!showId) throw new Error('Webhook missing showId metadata')

  const adults = Number(evt.metadata.adults ?? '0')
  const children = Number(evt.metadata.children ?? '0')
  const total = adults + children
  if (total <= 0) throw new Error('Webhook has zero tickets')

  const order = await deps.createOrder({
    buyerName: evt.metadata.buyerName ?? '',
    email: evt.metadata.email ?? '',
    adultCount: adults,
    childCount: children,
    total: evt.amountReceived,
    stripePaymentIntentId: evt.paymentIntentId,
    refundStatus: 'none',
    show: showId,
  })

  for (let i = 0; i < total; i++) {
    await deps.createQrToken({ token: deps.generateToken(), order: order.id })
  }

  await deps.incrementOnlineSold(showId, total)

  return { orderId: order.id, skipped: false }
}
