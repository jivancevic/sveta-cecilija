import { issueTickets, type TicketType } from '../tickets/ticket-issuance'

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
  code: string
  channel: 'online'
  buyerName: string
  email: string
  adultCount: number
  childCount: number
  total: number
  stripePaymentIntentId: string
  refundStatus: 'none'
  show: string
  locale: 'en' | 'hr'
  // Promo code applied at checkout (ADR-0018), resolved from PI metadata to a
  // PromoCodes record id. Undefined for orders with no code. Attribution only;
  // `total` stays the Stripe amount.
  promoCode?: string
}

export interface NotifyBuyerInput {
  orderId: string
  showId: string
  buyer: { name: string; email: string }
  order: { adultCount: number; childCount: number; total: number }
  // One entry per person (ADR-0007); each gets its own QR in the PDF.
  tickets: { token: string; type: TicketType; ref: string }[]
  // Human order code printed on the tickets (e.g. "AB23").
  orderCode: string
  locale: 'en' | 'hr'
}

export interface NotifyMetaInput {
  orderId: string
  /** Charged amount in cents (Stripe's `amount_received`). */
  valueCents: number
  email: string
}

export interface PaymentSucceededDeps {
  findOrderByPaymentIntent: (id: string) => Promise<{ id: string } | null>
  createOrder: (input: CreateOrderInput) => Promise<{ id: string }>
  // One ticket per person (ADR-0007). No longer one token per order.
  createTickets: (input: { order: string; tickets: { token: string; type: TicketType }[] }) => Promise<void>
  generateToken: () => string
  // Yields a unique order code (order-code.ts wired to a DB uniqueness check).
  generateOrderCode: () => Promise<string>
  /**
   * Resolves the promo code from PI metadata (ADR-0018) to its PromoCodes record
   * id, or null if the code no longer exists. Optional: absent in contexts with
   * no promo support; codeless orders never call it.
   */
  resolvePromoCode?: (code: string) => Promise<{ id: string } | null>
  notifyBuyer: (input: NotifyBuyerInput) => Promise<void>
  /**
   * Server-side Meta Conversions API Purchase, deduped against the browser
   * pixel via `order_<orderId>`. Optional + best-effort: only runs for a
   * genuinely new order (after the idempotency check), and the route wiring
   * swallows its own errors so the webhook still returns 200.
   */
  notifyMeta?: (input: NotifyMetaInput) => Promise<void>
  /**
   * Serializes this order+ticket insert against partner sells of the same show
   * (#179), via the same Postgres advisory lock keyed on the show id. Online is
   * post-payment — we never reject here (the seat guard is pre-payment in
   * checkout.ts), but holding the lock keeps the active-ticket count consistent
   * so a concurrent partner sale can't miss these tickets. Defaults to a
   * pass-through; the webhook route wires `withShowSellLock`.
   */
  withSeatLock?: <T>(showId: number, critical: () => Promise<T>) => Promise<T>
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

  const locale: 'en' | 'hr' = evt.metadata.locale === 'hr' ? 'hr' : 'en'

  // Resolve an applied promo code (ADR-0018) to its record id for the Order's
  // nullable `promoCode` relationship. The code only reaches metadata after a
  // server-side validation in createCheckoutSession; if it has since been
  // deleted we leave the link null (ON DELETE SET NULL semantics). `order.total`
  // stays the Stripe amount either way.
  const promoCodeStr = evt.metadata.promoCode
  let promoCodeId: string | undefined
  if (promoCodeStr && deps.resolvePromoCode) {
    const resolved = await deps.resolvePromoCode(promoCodeStr)
    if (resolved) promoCodeId = resolved.id
  }

  // Derive the order code + one typed ticket per person (ADR-0007). The total is
  // authoritative from Stripe (evt.amountReceived) — issued.totalCents would be
  // the same online 5-for-4 figure, but we record what was actually charged.
  const issued = await issueTickets(
    {
      show: { id: Number(showId) },
      channel: 'online',
      adults,
      children,
      locale,
      buyer: { name: evt.metadata.buyerName ?? '', email: evt.metadata.email ?? '' },
    },
    { generateOrderCode: deps.generateOrderCode },
  )

  // Serialize the order+ticket insert against partner sells of the same show
  // (#179) via the shared advisory lock. Post-payment, so we never reject here
  // (the seat guard is pre-payment in checkout.ts); the lock only keeps the
  // active-ticket count consistent across channels. notifyBuyer (slow email)
  // stays outside the lock.
  const withSeatLock = deps.withSeatLock ?? (<T>(_id: number, fn: () => Promise<T>) => fn())
  const { orderId, tickets } = await withSeatLock(Number(showId), async () => {
    const order = await deps.createOrder({
      code: issued.code,
      channel: 'online',
      buyerName: evt.metadata.buyerName ?? '',
      email: evt.metadata.email ?? '',
      adultCount: adults,
      childCount: children,
      total: evt.amountReceived,
      stripePaymentIntentId: evt.paymentIntentId,
      refundStatus: 'none',
      show: showId,
      locale,
      promoCode: promoCodeId,
    })

    // One ticket per person, each with its own QR token and CODE-N ref. Seats are
    // now counted as active ticket rows, so the webhook no longer bumps online_sold.
    const tickets = issued.tickets.map((t) => ({
      token: deps.generateToken(),
      type: t.type,
      ref: t.ref,
    }))
    await deps.createTickets({ order: order.id, tickets })
    return { orderId: order.id, tickets }
  })

  await deps.notifyBuyer({
    orderId,
    showId,
    buyer: { name: evt.metadata.buyerName ?? '', email: evt.metadata.email ?? '' },
    order: { adultCount: adults, childCount: children, total: evt.amountReceived },
    // Every ticket's QR goes into the 2-up A5 PDF (#140).
    tickets,
    orderCode: issued.code,
    locale,
  })

  // Server-side Purchase to Meta (deduped with the browser pixel). Best-effort;
  // the route wiring already swallows errors, but only reached on a new order so
  // a Stripe retry on an existing order can't double-fire it.
  if (deps.notifyMeta) {
    await deps.notifyMeta({
      orderId,
      valueCents: evt.amountReceived,
      email: evt.metadata.email ?? '',
    })
  }

  return { orderId, skipped: false }
}
