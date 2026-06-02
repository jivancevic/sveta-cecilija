import type { Venue } from '../venues'
import { VENUE_LABEL } from '../venues'
import { postBrevoEmail } from './post-brevo-email'

function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

export interface SendRefundEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  amountCents: number
  show: { date: string; time: string; venue: Venue }
  locale?: 'en' | 'hr'
}

export interface SendRefundEmailDeps {
  fetch: typeof fetch
  brevoApiKey: string
}

function renderSubject(locale: 'en' | 'hr', amount: string): string {
  return locale === 'hr'
    ? `Povrat sredstava ${amount} - HGD Sveta Cecilija`
    : `Your refund of ${amount} - HGD Sveta Cecilija`
}

function renderHtml(input: SendRefundEmailInput, locale: 'en' | 'hr'): string {
  const amount = formatEur(input.amountCents)
  const venueLabel = VENUE_LABEL[locale][input.show.venue]
  if (locale === 'hr') {
    return `
      <p>Poštovani ${input.buyer.name},</p>
      <p>Vaš povrat u iznosu od <strong>${amount}</strong> je obrađen i pojavit će se na vašoj kartici za 5–10 radnih dana.</p>
      <p>Predstava: ${input.show.date} u ${input.show.time}, ${venueLabel}.</p>
      <p>Hvala vam i ispričavamo se na neugodnosti.</p>
    `.trim()
  }
  return `
    <p>Hi ${input.buyer.name},</p>
    <p>Your refund of <strong>${amount}</strong> has been processed and will appear on your card in 5–10 business days.</p>
    <p>Show: ${input.show.date} at ${input.show.time}, ${venueLabel}.</p>
    <p>Thank you, and we apologise for the inconvenience.</p>
  `.trim()
}

export async function sendRefundEmail(
  input: SendRefundEmailInput,
  deps: SendRefundEmailDeps,
): Promise<void> {
  const locale = input.locale ?? 'en'
  const amount = formatEur(input.amountCents)
  const body = {
    sender: { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' },
    to: [{ email: input.buyer.email, name: input.buyer.name }],
    subject: renderSubject(locale, amount),
    htmlContent: renderHtml(input, locale),
  }
  try {
    const res = await postBrevoEmail(body, {
      fetch: deps.fetch,
      brevoApiKey: deps.brevoApiKey,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(
        `[sendRefundEmail] Brevo error orderId=${input.orderId} email=${input.buyer.email} amountCents=${input.amountCents} status=${res.status} body=${text}`,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[sendRefundEmail] fetch failed orderId=${input.orderId} email=${input.buyer.email} amountCents=${input.amountCents} error=${msg}`,
    )
  }
}
