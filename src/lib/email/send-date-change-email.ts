// Brevo sender for the show-reschedule notice. Sent to each online buyer of a
// show whose date has been moved. One message per buyer in their own locale (no
// BCC — buyer emails must not leak to each other). Same fire-and-forget +
// grep-able-log shape as the other senders; all mail goes through postBrevoEmail
// so DEV_EMAIL_OVERRIDE applies. Sibling of send-venue-change-email.ts.
//
// Rebuilt to the current brand standard (ADR-0003 / the review email): gold top
// rule, full-colour crest header, crossed-swords divider, near-black footer.
// Leads with reassurance (tickets moved automatically, nothing to do) and offers
// a SECONDARY self-serve refund CTA for the buyer who can't make the new date
// (ADR-0021) — replacing the old "reply to this email and we'll find a solution"
// line, since the link IS the solution.
import { VENUE_LABEL, type Venue } from '../venues'
import { postBrevoEmail } from './post-brevo-email'

// Transactional show stream: same Brevo-authenticated tickets@ sender as ticket
// confirmations + refunds + venue changes, Reply-To info@ (set on the send body
// below). One coherent show-mail identity, kept off the bilten marketing subdomain.
const SENDER = { email: 'tickets@moreska.eu', name: 'HGD Sveta Cecilija' }

// Buyers can independently confirm the new date on the official site — both
// reassurance and a quiet anti-phishing cue (the change is verifiable, not just
// asserted in an email). The link TEXT is the bare domain so the recipient sees
// exactly where it goes (moreska.eu) rather than an opaque "click here" button.
const TICKETS_URL = 'https://moreska.eu/tickets'
const TICKETS_URL_DISPLAY = 'moreska.eu/tickets'

// Public brand assets, served from prod. Email clients don't render webp
// reliably (Outlook), so these are dedicated PNG copies under public/email/.
const ASSET_BASE = 'https://moreska.eu/email'

export interface SendDateChangeEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  show: { oldDate: string; newDate: string; time: string; venue: Venue }
  locale?: 'en' | 'hr'
  // Absolute self-serve refund URL for THIS order (signed per-order token,
  // ADR-0021). Omitted only if the caller could not build it (no PAYLOAD_SECRET);
  // the notice still sends, just without the refund CTA.
  refundUrl?: string
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
      "We're sorry, we've had to reschedule this Moreška sword dance performance. Your tickets are automatically valid for the new date, there's nothing you need to do.",
    verify: 'You can confirm this change yourself on our official website:',
    escapeHatch:
      "If the new date no longer works for you, you can cancel your tickets and get a refund yourself, no need to contact us:",
    refundCta: 'Cancel & refund my tickets',
    signoff: 'With thanks,',
    org: 'Moreška by HGD Sveta Cecilija',
    footer:
      'You\'re receiving this because you hold a ticket for this performance. Legal entity: HGD Sveta Cecilija, Korčula, Croatia. Contact:',
  },
  hr: {
    subject: 'Vaša Moreška izvedba premještena je na novi datum',
    heading: 'Promjena datuma vaše Moreške izvedbe',
    greeting: (name: string) => `Poštovani ${name},`,
    intro:
      'Žao nam je, morali smo pomaknuti ovu izvedbu Moreške (mačevni ples) na novi datum. Vaše ulaznice automatski vrijede za novi termin, ne morate ništa poduzimati.',
    verify: 'Ovu promjenu možete sami provjeriti na našoj službenoj stranici:',
    escapeHatch:
      'Ako vam novi termin više ne odgovara, ovdje možete sami otkazati ulaznice i zatražiti povrat novca, bez kontaktiranja nas:',
    refundCta: 'Otkaži ulaznice i zatraži povrat',
    signoff: 'Srdačan pozdrav,',
    org: 'Moreška by HGD Sveta Cecilija',
    footer:
      'Ovu poruku primate jer imate ulaznicu za ovu izvedbu. Pravna osoba: HGD Sveta Cecilija, Korčula, Hrvatska. Kontakt:',
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
  const { buyer, show, refundUrl } = input
  const c = COPY[locale]
  // Single-quote family names: these sit inside double-quoted style="…" attrs,
  // so a double-quoted "Segoe UI" would close the attribute early.
  const fontHeading = `'Bodoni Moda SC', 'Bodoni Moda', Georgia, serif`
  const fontBody = `Inter, -apple-system, 'Segoe UI', Arial, sans-serif`
  const gold = '#b48a3c'
  const ink = '#1a1a1a'
  const cream = '#faf6ef'
  const border = '#e6dfd1'
  const bodyText = '#3d372f'
  const muted = '#6b6257'

  const oldLabel = `${formatDate(show.oldDate, locale)} · ${show.time}`
  const newLabel = `${formatDate(show.newDate, locale)} · ${show.time}`

  // Stacked old → new (a downward arrow), so the long localised date strings
  // never have to share a line — robust on narrow mobile clients.
  const oldBox = `display:inline-block;padding:6px 14px;font-weight:600;font-size:15px;color:#9a9a9a;text-decoration:line-through;`
  const newBox = `display:inline-block;padding:8px 16px;background:#f1e9d8;border:1px solid #dcae5e;border-radius:2px;font-weight:700;font-size:17px;color:${ink};`
  const linkStyle = `color:${gold};font-weight:700;text-decoration:underline;`

  // SECONDARY CTA: outlined gold (white fill), deliberately quieter than the
  // review email's filled buttons — reassurance stays primary, this reads as
  // "only if you need it". Only rendered when a refund URL was built.
  const refundBlock = refundUrl
    ? `
        <tr><td style="padding:2px 44px 4px 44px;background:#ffffff;">
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${muted};text-align:center;">${c.escapeHatch}</p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 30px 32px;background:#ffffff;">
          <a href="${refundUrl}" style="display:inline-block;padding:12px 24px;text-decoration:none;font-family:${fontBody};font-weight:600;font-size:15px;letter-spacing:0.01em;border-radius:3px;color:${gold};background:#ffffff;border:1.5px solid ${gold};">${c.refundCta}</a>
        </td></tr>`
    : ''

  return `
<div style="margin:0;padding:0;background:${cream};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${cream};font-family:${fontBody};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${border};border-radius:4px;overflow:hidden;">

        <!-- gold top rule -->
        <tr><td style="height:4px;background:${gold};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- header: full-colour crest on cream (carries the wordmark already) -->
        <tr><td align="center" style="background:${cream};padding:28px 32px 26px 32px;border-bottom:1px solid ${border};">
          <img src="${ASSET_BASE}/logo.png" alt="HGD Sveta Cecilija - Korčula" height="88" style="display:block;height:88px;width:auto;margin:0 auto;" />
        </td></tr>

        <!-- body: heading + reassurance -->
        <tr><td style="padding:36px 44px 6px 44px;background:#ffffff;">
          <h1 style="font-family:${fontHeading};font-size:28px;line-height:1.2;margin:0 0 20px 0;color:${ink};text-align:center;">${c.heading}</h1>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:${bodyText};">${c.greeting(buyer.name)}</p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;color:${bodyText};">${c.intro}</p>
        </td></tr>

        <!-- old → new date -->
        <tr><td align="center" style="padding:10px 44px 4px 44px;background:#ffffff;">
          <div style="${oldBox}">${oldLabel}</div>
          <div style="font-size:22px;line-height:1.4;color:${gold};font-weight:700;">↓</div>
          <div style="${newBox}">${newLabel}</div>
          <div style="margin-top:12px;font-size:14px;line-height:1.5;color:${muted};">${venueLine(show.venue, locale)}</div>
        </td></tr>

        <!-- verify (anti-phishing cue) -->
        <tr><td align="center" style="padding:16px 44px 6px 44px;background:#ffffff;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:${muted};">${c.verify}<br/>
            <a href="${TICKETS_URL}" style="${linkStyle}">${TICKETS_URL_DISPLAY}</a>
          </p>
        </td></tr>

        <!-- crossed-swords divider -->
        <tr><td style="padding:18px 44px 16px 44px;background:#ffffff;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;"><div style="height:1px;line-height:1px;font-size:0;background:#e6dcc4;">&nbsp;</div></td>
              <td width="72" style="padding:0 16px;vertical-align:middle;">
                <img src="${ASSET_BASE}/swords.png" alt="" width="40" style="display:block;width:40px;height:auto;margin:0 auto;" />
              </td>
              <td style="vertical-align:middle;"><div style="height:1px;line-height:1px;font-size:0;background:#e6dcc4;">&nbsp;</div></td>
            </tr>
          </table>
        </td></tr>
${refundBlock}
        <!-- sign-off -->
        <tr><td style="padding:2px 44px 34px 44px;background:#ffffff;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:${muted};">${c.signoff}<br/>${c.org}</p>
        </td></tr>

        <!-- footer: near-black band -->
        <tr><td style="padding:22px 44px;background:${ink};font-size:12px;line-height:1.6;color:#b9b2a6;">
          ${c.footer} <a href="mailto:info@moreska.eu" style="color:#b9b2a6;">info@moreska.eu</a>.
        </td></tr>
      </table>
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
