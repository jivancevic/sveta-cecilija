// Brevo sender for the show-reschedule notice. Sent to each online buyer of a
// show whose date has been moved. One message per buyer in their own locale (no
// BCC — buyer emails must not leak to each other). Same fire-and-forget +
// grep-able-log shape as the other senders; all mail goes through postBrevoEmail
// so DEV_EMAIL_OVERRIDE applies. Sibling of send-venue-change-email.ts.
import { postBrevoEmail } from './post-brevo-email'

// Transactional show stream: same Brevo-authenticated tickets@ sender as ticket
// confirmations + refunds + venue changes, Reply-To info@ (set on the send body
// below). One coherent show-mail identity, kept off the bilten marketing subdomain.
const SENDER = { email: 'tickets@moreska.eu', name: 'HGD Sveta Cecilija' }

export interface SendDateChangeEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  show: { oldDate: string; newDate: string; time: string }
  locale?: 'en' | 'hr'
}

export interface SendDateChangeEmailDeps {
  fetch: typeof fetch
  brevoApiKey: string
}

function renderSubject(locale: 'en' | 'hr'): string {
  return locale === 'hr'
    ? 'Promjena datuma izvedbe - HGD Sveta Cecilija'
    : 'Performance date changed - HGD Sveta Cecilija'
}

function renderHtml(input: SendDateChangeEmailInput, locale: 'en' | 'hr'): string {
  const { buyer, show } = input
  const fontHeading = `"Bodoni Moda SC", "Bodoni Moda", Georgia, serif`
  const fontBody = `Inter, -apple-system, "Segoe UI", Arial, sans-serif`
  const gold = '#b48a3c'
  const bg = '#faf6ef'
  const text = '#1a1a1a'
  const dateBox = `display:inline-block;padding:4px 10px;background:#f1e9d8;border:1px solid #e6dfd1;border-radius:2px;font-weight:600;`

  if (locale === 'hr') {
    return `
<div style="background:${bg};padding:32px 16px;font-family:${fontBody};color:${text};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6dfd1;">
    <tr><td style="padding:36px 32px 12px 32px;">
      <h1 style="font-family:${fontHeading};font-size:26px;line-height:1.2;margin:0 0 16px 0;color:${text};">Promjena datuma izvedbe</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Poštovani ${buyer.name},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Izvedba za koju imate ulaznicu premještena je na novi datum. Vaše ulaznice i dalje vrijede, na novom datumu i u isto vrijeme (${show.time}).</p>
    </td></tr>
    <tr><td align="center" style="padding:4px 32px 20px 32px;font-size:16px;line-height:2;">
      <span style="${dateBox}color:#8a8a8a;text-decoration:line-through;">${show.oldDate}</span>
      <span style="padding:0 8px;color:${gold};font-weight:700;">→</span>
      <span style="${dateBox}color:${text};">${show.newDate}</span>
    </td></tr>
    <tr><td style="padding:0 32px 28px 32px;">
      <p style="margin:0;font-size:15px;line-height:1.55;">Ako ste izvedbu dodali u kalendar, ažurirajte datum. Ako vam novi datum ne odgovara, jednostavno odgovorite na ovaj e-mail i pronaći ćemo rješenje.</p>
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
      <h1 style="font-family:${fontHeading};font-size:26px;line-height:1.2;margin:0 0 16px 0;color:${text};">Your performance date has changed</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Hi ${buyer.name},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">The performance you have tickets for has moved to a new date. Your tickets remain valid for the new date, at the same time (${show.time}).</p>
    </td></tr>
    <tr><td align="center" style="padding:4px 32px 20px 32px;font-size:16px;line-height:2;">
      <span style="${dateBox}color:#8a8a8a;text-decoration:line-through;">${show.oldDate}</span>
      <span style="padding:0 8px;color:${gold};font-weight:700;">→</span>
      <span style="${dateBox}color:${text};">${show.newDate}</span>
    </td></tr>
    <tr><td style="padding:0 32px 28px 32px;">
      <p style="margin:0;font-size:15px;line-height:1.55;">If you added the show to your calendar, please update the date. If the new date no longer works for you, just reply to this email and we will sort it out with you.</p>
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

export async function sendDateChangeEmail(
  input: SendDateChangeEmailInput,
  deps: SendDateChangeEmailDeps,
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
  return { subject: renderSubject(locale), html: renderHtml(input, locale) }
}
