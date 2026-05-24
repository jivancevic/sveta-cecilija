import type { PurchasableShow } from '../capacity'

// Errors of this type indicate a structurally malformed event that no number
// of retries can fix — the webhook route should log + return 200 so Stripe
// stops retrying.
export class UnrecoverableWebhookError extends Error {
  override name = 'UnrecoverableWebhookError'
}

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

export interface NotifyBuyerInput {
  orderId: string
  showId: string
  buyer: { name: string; email: string }
  order: { adultCount: number; childCount: number; total: number }
  tokens: string[]
  locale: 'en' | 'hr'
}

export interface PaymentSucceededDeps {
  findOrderByPaymentIntent: (id: string) => Promise<{ id: string } | null>
  findShow: (id: string) => Promise<PurchasableShow | null>
  createOrder: (input: CreateOrderInput) => Promise<{ id: string }>
  createQrToken: (input: { token: string; order: string }) => Promise<void>
  incrementOnlineSold: (showId: string, by: number) => Promise<void>
  generateToken: () => string
  notifyBuyer: (input: NotifyBuyerInput) => Promise<void>
}

export async function handlePaymentSucceeded(
  evt: PaymentSucceededEvent,
  deps: PaymentSucceededDeps,
): Promise<{ orderId: string | null; skipped: boolean }> {
  const existing = await deps.findOrderByPaymentIntent(evt.paymentIntentId)
  if (existing) return { orderId: existing.id, skipped: true }

  const showId = evt.metadata.showId
  if (!showId) throw new UnrecoverableWebhookError('Webhook missing showId metadata')

  const adults = Number(evt.metadata.adults ?? '0')
  const children = Number(evt.metadata.children ?? '0')
  const total = adults + children
  if (total <= 0) throw new UnrecoverableWebhookError('Webhook has zero tickets')

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

  const tokens: string[] = []
  for (let i = 0; i < total; i++) {
    const token = deps.generateToken()
    tokens.push(token)
    await deps.createQrToken({ token, order: order.id })
  }

  await deps.incrementOnlineSold(showId, total)

  const locale = evt.metadata.locale === 'hr' ? 'hr' : 'en'
  await deps.notifyBuyer({
    orderId: order.id,
    showId,
    buyer: { name: evt.metadata.buyerName ?? '', email: evt.metadata.email ?? '' },
    order: { adultCount: adults, childCount: children, total: evt.amountReceived },
    tokens,
    locale,
  })

  return { orderId: order.id, skipped: false }
}
