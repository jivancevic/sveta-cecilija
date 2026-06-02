import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getLocale } from '@/lib/locale'
import { getDictionary } from '@/lib/i18n'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import PurchaseEvent from '@/components/PurchaseEvent'
import MetaPixelPurchase from '@/components/MetaPixelPurchase'
import { signTicketLink } from '@/lib/ticket-link'

export const dynamic = 'force-dynamic'

interface RouteProps {
  params: Promise<{ showId: string }>
  searchParams: Promise<{ pi?: string; payment_intent?: string }>
}

export default async function ConfirmationRoute({ params, searchParams }: RouteProps) {
  await params
  const { pi, payment_intent } = await searchParams
  const paymentIntentId = pi ?? payment_intent
  const locale = await getLocale()
  const dict = await getDictionary(locale)

  if (!paymentIntentId) notFound()

  const payload = await getPayload({ config })
  // Webhook is what creates the Order — it may race with this page render after Stripe redirect.
  // Retry a few times so users don't see a 404 in the gap.
  let order = null
  for (let i = 0; i < 5 && !order; i++) {
    const found = await payload.find({
      collection: 'orders',
      where: { stripePaymentIntentId: { equals: paymentIntentId } },
      limit: 1,
      depth: 0,
    })
    order = found.docs[0] ?? null
    if (!order) await new Promise((r) => setTimeout(r, 400))
  }

  if (!order) notFound()

  const ticketCount = ((order.adultCount as number) ?? 0) + ((order.childCount as number) ?? 0)
  const totalCents = (order.total as number) ?? 0
  const transactionId = (order.stripePaymentIntentId as string) ?? paymentIntentId
  const purchaseValueEur = totalCents / 100
  const buyerEmail = (order.email as string) ?? ''
  const pdfHref = buyerEmail
    ? `/api/orders/${order.id}/tickets.pdf?t=${signTicketLink({ orderId: String(order.id), email: buyerEmail })}`
    : null

  return (
    <div className="inner-page t-stone">
      <PurchaseEvent
        transactionId={transactionId}
        value={purchaseValueEur}
        quantity={ticketCount}
      />
      <MetaPixelPurchase value={purchaseValueEur} currency="EUR" orderId={order.id as string | number} />
      <Nav locale={locale} t={dict.nav} variant="inner" />
      <main className="checkout-confirm">
        <h1 className="checkout-confirm__h">{dict.checkoutPage.thankYouHeading}</h1>
        <p className="checkout-confirm__body">{dict.checkoutPage.thankYouBody}</p>
        <dl className="checkout-confirm__refs">
          <div>
            <dt>{dict.checkoutPage.orderRefLabel}</dt>
            <dd>:</dd>
            <dd>{(order.code as string) ?? String(order.id)}</dd>
          </div>
          <div>
            <dt>{dict.checkoutPage.ticketCountLabel}</dt>
            <dd>:</dd>
            <dd>{ticketCount}</dd>
          </div>
        </dl>
        {pdfHref && (
          <div className="checkout-confirm__pdf">
            <p className="checkout-confirm__pdfBody">
              {dict.checkoutPage.ticketsAlsoSentTo.replace('{email}', buyerEmail)}
            </p>
            <a href={pdfHref} className="btn btn--primary checkout-confirm__pdfBtn" download>
              {dict.checkoutPage.downloadTicketsPdf}
            </a>
          </div>
        )}
        <a href="/tickets" className="checkout-page__back">{dict.checkoutPage.pageBack}</a>
      </main>
      <Footer locale={locale} t={dict.footer} />
    </div>
  )
}
