import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getLocale } from '@/lib/locale'
import { getDictionary } from '@/lib/i18n'
import { VENUE_CAPACITY, type Venue } from '@/lib/venues'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import CheckoutForm from '@/components/CheckoutForm'
import EventJsonLd from '@/components/EventJsonLd'
import { buildMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params
  return {
    ...buildMetadata({
      title: 'Checkout — Moreška Korčula',
      description:
        'Complete your Moreška ticket purchase. Secure card payment via Stripe.',
      path: `/checkout/${showId}`,
    }),
    robots: { index: false, follow: true },
  }
}

interface RouteProps {
  params: Promise<{ showId: string }>
  searchParams: Promise<{ adults?: string; children?: string }>
}

function parseQty(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

export default async function CheckoutRoute({ params, searchParams }: RouteProps) {
  const { showId } = await params
  const { adults: adultsStr, children: childrenStr } = await searchParams
  const locale = await getLocale()
  const dict = await getDictionary(locale)

  const payload = await getPayload({ config })
  let showDoc
  try {
    showDoc = await payload.findByID({ collection: 'shows', id: showId, depth: 0 })
  } catch {
    notFound()
  }
  if (!showDoc || showDoc.status === 'cancelled') notFound()

  const venue = (showDoc.venue as Venue) ?? 'ljetno-kino'
  const remaining =
    VENUE_CAPACITY[venue] -
    ((showDoc.onlineSold as number) ?? 0) -
    ((showDoc.inPersonSold as number) ?? 0) -
    ((showDoc.legacyReserved as number) ?? 0)

  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? ''

  const showForJsonLd = {
    id: String(showDoc.id),
    date: showDoc.date as string,
    time: showDoc.time as string,
    venue,
    remaining,
    status: (showDoc.status as 'active' | 'cancelled') ?? 'active',
  }

  return (
    <div className="inner-page t-stone">
      <EventJsonLd shows={[showForJsonLd]} />
      <Nav locale={locale} t={dict.nav} variant="inner" />
      <main className="checkout-page">
        <a href="/tickets" className="checkout-page__back">{dict.checkoutPage.pageBack}</a>
        <h1 className="checkout-page__h">{dict.checkoutPage.pageHeading}</h1>
        <CheckoutForm
          locale={locale}
          t={dict.checkoutPage}
          tPerf={dict.performancesPage}
          show={{
            id: String(showDoc.id),
            date: showDoc.date as string,
            time: showDoc.time as string,
            venue,
            remaining,
          }}
          initialAdults={parseQty(adultsStr, 2)}
          initialChildren={parseQty(childrenStr, 0)}
          stripePublishableKey={publishableKey}
        />
      </main>
      <Footer locale={locale} t={dict.footer} />
    </div>
  )
}
