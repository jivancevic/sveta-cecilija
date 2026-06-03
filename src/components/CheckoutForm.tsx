'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import Link from 'next/link'
import type { Dictionary } from '@/lib/i18n'
import type { Locale } from '@/proxy'
import type { Venue } from '@/lib/venues'
import { calculateOrderTotal } from '@/lib/pricing'
import { startCheckout } from '@/app/actions/checkout'

interface ShowSummary {
  id: string
  date: string
  time: string
  venue: Venue
  remaining: number
}

interface Props {
  locale: Locale
  t: Dictionary['checkoutPage']
  tPerf: Dictionary['performancesPage']
  show: ShowSummary
  initialAdults: number
  initialChildren: number
  stripePublishableKey: string
  /** Soft opt-in collection notice (#148). */
  consentNotice: string
}

const stripePromiseCache = new Map<string, Promise<Stripe | null>>()
function getStripePromise(key: string) {
  let p = stripePromiseCache.get(key)
  if (!p) {
    p = loadStripe(key)
    stripePromiseCache.set(key, p)
  }
  return p
}

function formatDate(iso: string, locale: Locale) {
  const d = new Date(iso)
  return d.toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function CheckoutForm({
  locale,
  t,
  tPerf,
  show,
  initialAdults,
  initialChildren,
  stripePublishableKey,
  consentNotice,
}: Props) {
  const stripePromise = stripePublishableKey ? getStripePromise(stripePublishableKey) : null
  const [adults, setAdults] = useState(initialAdults || (initialChildren ? 0 : 2))
  const [children, setChildren] = useState(initialChildren)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [refundOk, setRefundOk] = useState(false)
  const [privacyOk, setPrivacyOk] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(() => calculateOrderTotal({ adults, children }), [adults, children])
  const venueName = show.venue === 'zimsko-kino' ? tPerf.venueZimsko : tPerf.venueLjetno

  const formValid =
    name.trim().length > 0 &&
    EMAIL_RE.test(email) &&
    refundOk &&
    privacyOk &&
    totals.totalEur > 0 &&
    adults + children <= show.remaining

  function bumpAdults(delta: number) {
    if (clientSecret) return
    setAdults((v) => Math.max(0, v + delta))
  }
  function bumpChildren(delta: number) {
    if (clientSecret) return
    setChildren((v) => Math.max(0, v + delta))
  }

  async function startPayment() {
    setError(null)
    if (!name.trim()) return setError(t.errorName)
    if (!EMAIL_RE.test(email)) return setError(t.errorEmail)
    if (!refundOk || !privacyOk) return setError(t.errorAcknowledge)
    if (adults + children > show.remaining) return setError(t.errorCapacity)

    setCreating(true)
    const res = await startCheckout({
      showId: show.id,
      adults,
      children,
      buyer: { name: name.trim(), email: email.trim() },
      locale,
    })
    setCreating(false)
    if (!res.ok) {
      setError(res.error || t.errorGeneric)
      return
    }
    setClientSecret(res.clientSecret)
    setPaymentIntentId(res.paymentIntentId)
  }

  return (
    <div className="checkout">
      <section className="checkout__summary">
        <h2 className="checkout__h">{t.summaryHeading}</h2>
        <div className="checkout__row">
          <span>{t.performanceLabel}</span>
          <span>{formatDate(show.date, locale)} · {show.time}</span>
        </div>
        <div className="checkout__row">
          <span>{t.venueLabel}</span>
          <span>{venueName}</span>
        </div>

        <div className="checkout__qty">
          <div className="checkout__qty-row">
            <span>{t.adultsLabel} <em>{tPerf.adultPrice}</em></span>
            <div className="qty-picker">
              <button type="button" className="qty-btn" onClick={() => bumpAdults(-1)} disabled={!!clientSecret}>−</button>
              <span className="qty-val">{adults}</span>
              <button type="button" className="qty-btn" onClick={() => bumpAdults(1)} disabled={!!clientSecret}>+</button>
            </div>
          </div>
          <div className="checkout__qty-row">
            <span>{t.childrenLabel} <em>{tPerf.childPrice}</em></span>
            <div className="qty-picker">
              <button type="button" className="qty-btn" onClick={() => bumpChildren(-1)} disabled={!!clientSecret}>−</button>
              <span className="qty-val">{children}</span>
              <button type="button" className="qty-btn" onClick={() => bumpChildren(1)} disabled={!!clientSecret}>+</button>
            </div>
          </div>
        </div>

        <div className="checkout__row">
          <span>{t.subtotalLabel}</span>
          <span>€{totals.subtotalEur}</span>
        </div>
        {totals.discountEur > 0 && (
          <div className="checkout__row checkout__row--discount">
            <span>{t.discountLabel}</span>
            <span>−€{totals.discountEur}</span>
          </div>
        )}
        <div className="checkout__row checkout__row--total">
          <strong>{t.totalLabel}</strong>
          <strong>€{totals.totalEur}</strong>
        </div>
      </section>

      <section className="checkout__buyer">
        <h2 className="checkout__h">{t.buyerHeading}</h2>
        <label className="checkout__field">
          <span>{t.nameLabel}</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            disabled={!!clientSecret}
            required
          />
        </label>
        <label className="checkout__field">
          <span>{t.emailLabel}</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            disabled={!!clientSecret}
            required
          />
          <small>{t.emailHelp}</small>
        </label>

        <p className="checkout__consent">{consentNotice}</p>

        <label className="checkout__check">
          <input
            type="checkbox"
            checked={refundOk}
            onChange={(e) => setRefundOk(e.target.checked)}
            disabled={!!clientSecret}
          />
          <span>{t.refundLabel}</span>
        </label>
        <label className="checkout__check">
          <input
            type="checkbox"
            checked={privacyOk}
            onChange={(e) => setPrivacyOk(e.target.checked)}
            disabled={!!clientSecret}
          />
          <span>
            <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer">
              {t.privacyLinkLabel}
            </Link>
            {' - '}
            {t.privacyLabel}
          </span>
        </label>

        {error && <div className="checkout__error">{error}</div>}

        {!clientSecret && (
          <button
            type="button"
            className="checkout__pay-btn"
            onClick={startPayment}
            disabled={!formValid || creating}
          >
            {creating ? t.payingButton : t.payButton.replace('{amount}', String(totals.totalEur))}
          </button>
        )}
      </section>

      {clientSecret && stripePromise && (
        <section className="checkout__payment">
          <h2 className="checkout__h">{t.paymentHeading}</h2>
          <Elements stripe={stripePromise} options={{ clientSecret, locale: locale === 'hr' ? 'hr' : 'en' }}>
            <PaymentStep
              t={t}
              totalEur={totals.totalEur}
              paymentIntentId={paymentIntentId ?? ''}
              showId={show.id}
            />
          </Elements>
        </section>
      )}
      {clientSecret && !stripePromise && (
        <div className="checkout__error">Stripe is not configured (missing STRIPE_PUBLISHABLE_KEY)</div>
      )}
    </div>
  )
}

function PaymentStep({
  t,
  totalEur,
  paymentIntentId,
  showId,
}: {
  t: Dictionary['checkoutPage']
  totalEur: number
  paymentIntentId: string
  showId: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (stripe && elements) setReady(true)
  }, [stripe, elements])

  async function onPay() {
    if (!stripe || !elements) return
    setError(null)
    setSubmitting(true)
    // Routes are top-level (proxy.ts reads locale from cookie/header) — no /<locale> prefix.
    const returnUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/checkout/${showId}/confirmation?pi=${paymentIntentId}`
        : ''
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    })
    setSubmitting(false)
    if (err) setError(err.message ?? t.errorGeneric)
  }

  return (
    <>
      {!ready && <p>{t.loadingPayment}</p>}
      <PaymentElement onReady={() => setReady(true)} />
      {error && <div className="checkout__error">{error}</div>}
      <button
        type="button"
        className="checkout__pay-btn"
        onClick={onPay}
        disabled={!ready || submitting}
      >
        {submitting ? t.payingButton : t.payButton.replace('{amount}', String(totalEur))}
      </button>
    </>
  )
}
