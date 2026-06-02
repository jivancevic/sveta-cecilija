// Brevo sender for the bad-weather venue-change notice (#94). Sent to each
// online buyer of a show that has been moved Ljetno kino → Centar za kulturu.
// One message per buyer in their own locale (no BCC — buyer emails must not
// leak to each other). Same fire-and-forget + grep-able-log shape as the other
// senders; all mail goes through postBrevoEmail so DEV_EMAIL_OVERRIDE applies.
import { postBrevoEmail } from './post-brevo-email'

const SENDER = { email: 'info@moreska.eu', name: 'Moreška by HGD Sveta Cecilija' }

// Public venue names (ADR / CLAUDE.md): the DB value is the moved-to venue,
// shown to buyers by its public name.
const NEW_VENUE = {
  en: 'Cultural Center Korčula',
  hr: 'Centar za kulturu Korčula',
}
const OLD_VENUE = {
  en: 'Summer Cinema',
  hr: 'Ljetno kino',
}
const MAP_URL = 'https://www.google.com/maps/search/?api=1&query=Centar+za+kulturu+Kor%C4%8Dula'

export interface SendVenueChangeEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  show: { date: string; time: string }
  locale?: 'en' | 'hr'
}

export interface SendVenueChangeEmailDeps {
  fetch: typeof fetch
  brevoApiKey: string
}

function renderSubject(locale: 'en' | 'hr'): string {
  return locale === 'hr'
    ? 'Promjena lokacije nastupa - HGD Sveta Cecilija'
    : 'Venue change for your performance - HGD Sveta Cecilija'
}

function renderHtml(input: SendVenueChangeEmailInput, locale: 'en' | 'hr'): string {
  const { buyer, show } = input
  const fontHeading = `"Bodoni Moda SC", "Bodoni Moda", Georgia, serif`
  const fontBody = `Inter, -apple-system, "Segoe UI", Arial, sans-serif`
  const gold = '#b48a3c'
  const bg = '#faf6ef'
  const text = '#1a1a1a'
  const buttonStyle = `display:inline-block;padding:12px 24px;background:${gold};color:#fff;text-decoration:none;font-family:${fontBody};font-weight:600;font-size:15px;border-radius:2px;`

  if (locale === 'hr') {
    return `
<div style="background:${bg};padding:32px 16px;font-family:${fontBody};color:${text};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6dfd1;">
    <tr><td style="padding:36px 32px 12px 32px;">
      <h1 style="font-family:${fontHeading};font-size:26px;line-height:1.2;margin:0 0 16px 0;color:${text};">Promjena lokacije nastupa</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Poštovani ${buyer.name},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Zbog vremenskih uvjeta, nastup <strong>${show.date} u ${show.time}</strong> premješten je iz ${OLD_VENUE.hr} u <strong>${NEW_VENUE.hr}</strong>. Nastup se održava prema rasporedu, vaše ulaznice i dalje vrijede.</p>
    </td></tr>
    <tr><td align="center" style="padding:4px 32px 24px 32px;">
      <a href="${MAP_URL}" style="${buttonStyle}">Pogledaj novu lokaciju na karti</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px 32px;">
      <p style="margin:0;font-size:15px;line-height:1.55;">Ako vam nova lokacija ne odgovara, jednostavno odgovorite na ovaj e-mail i pronaći ćemo rješenje.</p>
    </td></tr>
    <tr><td style="padding:0 32px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.55;color:#555;">Srdačan pozdrav,<br/>Moreška by HGD Sveta Cecilija</p>
    </td></tr>
    <tr><td style="padding:16px 32px;border-top:1px solid #e6dfd1;font-size:11px;color:#888;line-height:1.5;">
      Pravna osoba: HGD Sveta Cecilija, Korčula, Hrvatska. Kontakt: <a href="mailto:info@moreska.eu" style="color:#888;">info@moreska.eu</a>.
    </td></tr>
  </table>
</div>
`.trim()
  }

  return `
<div style="background:${bg};padding:32px 16px;font-family:${fontBody};color:${text};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6dfd1;">
    <tr><td style="padding:36px 32px 12px 32px;">
      <h1 style="font-family:${fontHeading};font-size:26px;line-height:1.2;margin:0 0 16px 0;color:${text};">Your performance has moved venue</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Hi ${buyer.name},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Because of the weather, the performance on <strong>${show.date} at ${show.time}</strong> has moved from the ${OLD_VENUE.en} to the <strong>${NEW_VENUE.en}</strong>. The show goes ahead as scheduled and your tickets remain valid.</p>
    </td></tr>
    <tr><td align="center" style="padding:4px 32px 24px 32px;">
      <a href="${MAP_URL}" style="${buttonStyle}">See the new venue on the map</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px 32px;">
      <p style="margin:0;font-size:15px;line-height:1.55;">If the new venue no longer works for you, just reply to this email and we will sort it out with you.</p>
    </td></tr>
    <tr><td style="padding:0 32px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.55;color:#555;">With thanks,<br/>Moreška by HGD Sveta Cecilija</p>
    </td></tr>
    <tr><td style="padding:16px 32px;border-top:1px solid #e6dfd1;font-size:11px;color:#888;line-height:1.5;">
      Legal entity: HGD Sveta Cecilija, Korčula, Croatia. Contact: <a href="mailto:info@moreska.eu" style="color:#888;">info@moreska.eu</a>.
    </td></tr>
  </table>
</div>
`.trim()
}

export async function sendVenueChangeEmail(
  input: SendVenueChangeEmailInput,
  deps: SendVenueChangeEmailDeps,
): Promise<boolean> {
  const locale = input.locale ?? 'en'
  const body = {
    sender: SENDER,
    to: [{ email: input.buyer.email, name: input.buyer.name }],
    subject: renderSubject(locale),
    htmlContent: renderHtml(input, locale),
    replyTo: { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' },
  }
  try {
    const res = await postBrevoEmail(body, { fetch: deps.fetch, brevoApiKey: deps.brevoApiKey })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error(
        `[sendVenueChangeEmail] Brevo error orderId=${input.orderId} email=${input.buyer.email} status=${res.status} body=${txt}`,
      )
      return false
    }
    return true
  } catch (err) {
    console.error(
      `[sendVenueChangeEmail] fetch failed orderId=${input.orderId} email=${input.buyer.email} error=${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return false
  }
}

// Exposed for the admin preview step so the modal can show buyers exactly what
// will be sent before anything goes out.
export function renderVenueChangePreview(
  input: SendVenueChangeEmailInput,
  locale: 'en' | 'hr',
): { subject: string; html: string } {
  return { subject: renderSubject(locale), html: renderHtml(input, locale) }
}
