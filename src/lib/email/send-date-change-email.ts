// Brevo sender for the show-reschedule notice. Sent to each online buyer of a
// show whose date has been moved. One message per buyer in their own locale (no
// BCC — buyer emails must not leak to each other). Same fire-and-forget +
// grep-able-log shape as the other senders; all mail goes through postBrevoEmail
// so DEV_EMAIL_OVERRIDE applies. Sibling of send-venue-change-email.ts.
import { VENUE_LABEL, type Venue } from '../venues'
import { postBrevoEmail } from './post-brevo-email'

// Transactional show stream: same Brevo-authenticated tickets@ sender as ticket
// confirmations + refunds + venue changes, Reply-To info@ (set on the send body
// below). One coherent show-mail identity, kept off the bilten marketing subdomain.
const SENDER = { email: 'tickets@moreska.eu', name: 'HGD Sveta Cecilija' }

// Buyers can independently confirm the new date on the official site — both
// reassurance and a quiet anti-phishing cue (the change is verifiable, not just
// asserted in an email).
const TICKETS_URL = 'https://moreska.eu/tickets'

export interface SendDateChangeEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  show: { oldDate: string; newDate: string; time: string; venue: Venue }
  locale?: 'en' | 'hr'
}

export interface SendDateChangeEmailDeps {
  fetch: typeof fetch
  brevoApiKey: string
}

// All buyer-facing copy in one place so EN and HR stay structurally in lockstep
// (same shape as render-ticket-email.tsx). The performance is always named so a
// guest who bought months ago and forgot recognises it instantly; the reason is
// a fixed, gentle apology (this action never captures a specific cause).
const COPY = {
  en: {
    subject: 'Your Moreška sword dance show has moved to a new date',
    heading: 'Your Moreška performance has a new date',
    greeting: (name: string) => `Hi ${name},`,
    intro:
      "We're sorry — we've had to reschedule this Moreška sword dance performance. Your tickets remain valid for the new date; there's nothing you need to do.",
    verify: 'Confirm on the official website',
    closing:
      "If you saved the show to your calendar, please update it. If the new date no longer works for you, just reply to this email and we'll find a solution.",
    signoff: 'With thanks,',
    org: 'Moreška by HGD Sveta Cecilija',
    footer: 'Legal entity: HGD Sveta Cecilija, Korčula, Croatia. Contact:',
  },
  hr: {
    subject: 'Vaša Moreška izvedba premještena je na novi datum',
    heading: 'Promjena datuma vaše Moreške izvedbe',
    greeting: (name: string) => `Poštovani ${name},`,
    intro:
      'Žao nam je — morali smo pomaknuti ovu izvedbu Moreške (mačevni ples) na novi datum. Vaše ulaznice i dalje vrijede; ne morate ništa poduzimati.',
    verify: 'Provjerite na službenoj stranici',
    closing:
      'Ako ste izvedbu spremili u kalendar, ažurirajte datum. Ako vam novi datum ne odgovara, jednostavno odgovorite na ovaj e-mail i pronaći ćemo rješenje.',
    signoff: 'Srdačan pozdrav,',
    org: 'Moreška by HGD Sveta Cecilija',
    footer: 'Pravna osoba: HGD Sveta Cecilija, Korčula, Hrvatska. Kontakt:',
  },
} as const

// Weekday + date, localised — matches the ticket-email/PDF formatting. Anchored
// at T00:00:00Z + timeZone UTC so a bare YYYY-MM-DD never slips a day.
function formatDate(iso: string, locale: 'en' | 'hr'): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Venue line for a forgetful guest who may not remember where to go. The venue
// is unchanged by a reschedule; we still state it. In English we append the
// on-the-ground Croatian name in parens (that's what the signage in Korčula
// says), and ", Korčula" unless the name already carries the town.
function venueLine(venue: Venue, locale: 'en' | 'hr'): string {
  const en = VENUE_LABEL.en[venue]
  const hr = VENUE_LABEL.hr[venue]
  const base = locale === 'hr' ? hr : en === hr ? en : `${en} (${hr})`
  return base.includes('Korčula') ? base : `${base}, Korčula`
}

function renderHtml(input: SendDateChangeEmailInput, locale: 'en' | 'hr'): string {
  const { buyer, show } = input
  const c = COPY[locale]
  const fontHeading = `"Bodoni Moda SC", "Bodoni Moda", Georgia, serif`
  const fontBody = `Inter, -apple-system, "Segoe UI", Arial, sans-serif`
  const gold = '#b48a3c'
  const bg = '#faf6ef'
  const text = '#1a1a1a'

  const oldLabel = `${formatDate(show.oldDate, locale)} · ${show.time}`
  const newLabel = `${formatDate(show.newDate, locale)} · ${show.time}`

  // Stacked old → new (a downward arrow), so the long localised date strings
  // never have to share a line — robust on narrow mobile clients.
  const oldBox = `display:inline-block;padding:6px 14px;font-weight:600;font-size:15px;color:#9a9a9a;text-decoration:line-through;`
  const newBox = `display:inline-block;padding:8px 16px;background:#f1e9d8;border:1px solid #dcae5e;border-radius:2px;font-weight:700;font-size:17px;color:${text};`
  const buttonStyle = `display:inline-block;padding:12px 24px;background:${gold};color:#fff;text-decoration:none;font-family:${fontBody};font-weight:600;font-size:15px;border-radius:2px;`

  return `
<div style="background:${bg};padding:32px 16px;font-family:${fontBody};color:${text};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6dfd1;">
    <tr><td style="padding:36px 32px 12px 32px;">
      <h1 style="font-family:${fontHeading};font-size:26px;line-height:1.2;margin:0 0 16px 0;color:${text};">${c.heading}</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">${c.greeting(buyer.name)}</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">${c.intro}</p>
    </td></tr>
    <tr><td align="center" style="padding:4px 32px 4px 32px;">
      <div style="${oldBox}">${oldLabel}</div>
      <div style="font-size:22px;line-height:1.4;color:${gold};font-weight:700;">↓</div>
      <div style="${newBox}">${newLabel}</div>
      <div style="margin-top:12px;font-size:14px;line-height:1.5;color:#555;">${venueLine(show.venue, locale)}</div>
    </td></tr>
    <tr><td align="center" style="padding:20px 32px 4px 32px;">
      <a href="${TICKETS_URL}" style="${buttonStyle}">${c.verify}</a>
    </td></tr>
    <tr><td style="padding:24px 32px 28px 32px;">
      <p style="margin:0;font-size:15px;line-height:1.55;">${c.closing}</p>
    </td></tr>
    <tr><td style="padding:0 32px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.55;color:#555;">${c.signoff}<br/>${c.org}</p>
    </td></tr>
    <tr><td style="padding:16px 32px;border-top:1px solid #e6dfd1;font-size:11px;color:#888;line-height:1.5;">
      ${c.footer} <a href="mailto:info@moreska.eu" style="color:#888;">info@moreska.eu</a>.
    </td></tr>
  </table>
</div>
`.trim()
}

export async function sendDateChangeEmail(
  input: SendDateChangeEmailInput,
  deps: SendDateChangeEmailDeps,
): Promise<boolean> {
  const locale = input.locale ?? 'en'
  const body = {
    sender: SENDER,
    to: [{ email: input.buyer.email, name: input.buyer.name }],
    subject: COPY[locale].subject,
    htmlContent: renderHtml(input, locale),
    replyTo: { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' },
  }
  try {
    const res = await postBrevoEmail(body, { fetch: deps.fetch, brevoApiKey: deps.brevoApiKey })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error(
        `[sendDateChangeEmail] Brevo error orderId=${input.orderId} email=${input.buyer.email} status=${res.status} body=${txt}`,
      )
      return false
    }
    return true
  } catch (err) {
    console.error(
      `[sendDateChangeEmail] fetch failed orderId=${input.orderId} email=${input.buyer.email} error=${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return false
  }
}

// Exposed for the admin "send test to me" step so the modal can send exactly
// what buyers will receive before anything goes out to them.
export function renderDateChangePreview(
  input: SendDateChangeEmailInput,
  locale: 'en' | 'hr',
): { subject: string; html: string } {
  return { subject: COPY[locale].subject, html: renderHtml(input, locale) }
}
