// Transactional acknowledgement to the person who submits a public enquiry (#236).
// "We received your message, we'll reply soon." Fires through the single Brevo
// seam (postBrevoEmail) like every other mail path, from the verified
// transactional sender (tickets@moreska.eu) with Reply-To info@moreska.eu so the
// enquirer's reply lands in the org inbox. Localized to the enquirer's site
// language. Best-effort: throws on a Brevo failure so the caller (submitEnquiry)
// can swallow it — the enquiry is already persisted, a missed courtesy mail is
// not data loss.
import { postBrevoEmail } from './post-brevo-email'

export interface EnquiryAcknowledgementInput {
  name: string
  email: string
  // The enquirer's site language; defaults to 'en' when unknown.
  locale?: 'en' | 'hr'
}

export interface SendEnquiryAcknowledgementDeps {
  fetch: typeof fetch
  brevoApiKey: string
  // Defaults to process.env.DEV_EMAIL_OVERRIDE inside postBrevoEmail; injectable
  // for tests so a staging override never leaks into assertions.
  devEmailOverride?: string | null
}

// Same verified transactional sender as the ticket + enquiry-notification mail.
// Reply-To is the org inbox so the enquirer can reply straight to staff.
const SENDER = { email: 'tickets@moreska.eu', name: 'HGD Sveta Cecilija' }
const REPLY_TO = { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' }

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderSubject(locale: 'en' | 'hr'): string {
  return locale === 'hr'
    ? 'Primili smo vašu poruku'
    : 'We received your message'
}

function renderHtml(name: string, locale: 'en' | 'hr'): string {
  // Brand fonts mirrored from globals.css; inlined because email clients strip
  // external CSS. Tokens kept in step with send-review-email.ts.
  const fontHeading = `"Bodoni Moda SC", "Bodoni Moda", Georgia, serif`
  const fontBody = `Inter, -apple-system, "Segoe UI", Arial, sans-serif`
  const bg = '#faf6ef'
  const text = '#1a1a1a'
  const safeName = esc(name)

  if (locale === 'hr') {
    return `
<div style="background:${bg};padding:32px 16px;font-family:${fontBody};color:${text};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6dfd1;">
    <tr><td style="padding:36px 32px 12px 32px;">
      <h1 style="font-family:${fontHeading};font-size:26px;line-height:1.2;margin:0 0 16px 0;color:${text};">Hvala na poruci</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Poštovani ${safeName},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Primili smo vašu poruku i javit ćemo Vam se u najkraćem mogućem roku. Ako je hitno, možete nam pisati izravno na <a href="mailto:info@moreska.eu" style="color:#b48a3c;">info@moreska.eu</a>.</p>
    </td></tr>
    <tr><td style="padding:0 32px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.55;color:#555;">Srdačan pozdrav,<br/>HGD Sveta Cecilija, Korčula</p>
    </td></tr>
  </table>
</div>
`.trim()
  }

  return `
<div style="background:${bg};padding:32px 16px;font-family:${fontBody};color:${text};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6dfd1;">
    <tr><td style="padding:36px 32px 12px 32px;">
      <h1 style="font-family:${fontHeading};font-size:26px;line-height:1.2;margin:0 0 16px 0;color:${text};">Thank you for your message</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Hi ${safeName},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">We received your message about the Moreška and will get back to you as soon as we can. If it is urgent, you can reach us directly at <a href="mailto:info@moreska.eu" style="color:#b48a3c;">info@moreska.eu</a>.</p>
    </td></tr>
    <tr><td style="padding:0 32px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.55;color:#555;">With thanks,<br/>HGD Sveta Cecilija, Korčula</p>
    </td></tr>
  </table>
</div>
`.trim()
}

export async function sendEnquiryAcknowledgement(
  input: EnquiryAcknowledgementInput,
  deps: SendEnquiryAcknowledgementDeps,
): Promise<void> {
  const locale = input.locale ?? 'en'
  const res = await postBrevoEmail(
    {
      sender: SENDER,
      replyTo: REPLY_TO,
      to: [{ email: input.email, name: input.name }],
      subject: renderSubject(locale),
      htmlContent: renderHtml(input.name, locale),
    },
    {
      fetch: deps.fetch,
      brevoApiKey: deps.brevoApiKey,
      devEmailOverride: deps.devEmailOverride,
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Brevo enquiry acknowledgement failed status=${res.status} body=${text}`)
  }
}
