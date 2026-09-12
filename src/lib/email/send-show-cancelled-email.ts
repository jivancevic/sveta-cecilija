// Brevo sender for the show-CANCELLATION notice (#497). Sent to every buyer of
// a cancelled public performance who has an address on file. One message per
// order in the buyer's own locale (no BCC, buyer emails must not leak to each
// other). Sibling of send-date-change-email.ts and built on the same brand
// shell; all mail goes through postBrevoEmail so DEV_EMAIL_OVERRIDE applies.
//
// The reschedule notice leads with reassurance ("your tickets still work").
// This one cannot: the evening is gone, so it leads with the apology and then
// answers the only question the buyer has, which is about their money. That
// answer differs by channel, so the copy has three money blocks (`RefundMode`):
//
//   refund         we already refunded the card / wallet that paid (online)
//   point-of-sale  a partner charged it, so the partner returns it
//   none           a comp seat was free, there is nothing to return
//
// There is no CTA and no link to /tickets beyond the plain site link: there is
// nothing for the buyer to do, and offering a "book another date" button on the
// message that cancels their evening reads as a sales pitch.
import { VENUE_LABEL, type Venue } from '../venues'
import { postBrevoEmail } from './post-brevo-email'
import type { RefundMode } from '../show-cancel'

// Transactional show stream: same Brevo-authenticated tickets@ sender as ticket
// confirmations, refunds and date changes, Reply-To info@. One coherent
// show-mail identity, kept off the bilten marketing subdomain.
const SENDER = { email: 'tickets@moreska.eu', name: 'HGD Sveta Cecilija' }

const TICKETS_URL = 'https://moreska.eu/tickets'
const TICKETS_URL_DISPLAY = 'moreska.eu/tickets'

// Public brand assets, served from prod. Email clients don't render webp
// reliably (Outlook), so these are dedicated PNG copies under public/email/.
const ASSET_BASE = 'https://moreska.eu/email'

export interface SendShowCancelledEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  show: { date: string; time: string; venue: Venue }
  /** What this buyer is told about their money; see the header. */
  mode: RefundMode
  /** EUR cents returned, stated only in `refund` mode. */
  amountCents?: number
  locale?: 'en' | 'hr'
}

export interface SendShowCancelledEmailDeps {
  fetch: typeof fetch
  brevoApiKey: string
}

function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

// All buyer-facing copy in one place so EN and HR stay structurally in lockstep.
// "Original payment method", never "your card": the Payment Element also takes
// PayPal, Link and Revolut Pay, and Stripe reverses a refund down the same rail
// it was charged on, so telling a PayPal buyer to watch their card sends them
// looking in the wrong place (the same rule as send-refund-email.ts).
const COPY = {
  en: {
    subject: 'Your Moreška sword dance performance has been cancelled',
    heading: 'This performance has been cancelled',
    greeting: (name: string) => `Hi ${name},`,
    intro:
      "We're very sorry. This Moreška sword dance performance has been cancelled and will not take place. Your tickets for it are no longer valid.",
    money: {
      refund: (amount: string) =>
        `We have refunded the full amount of <strong>${amount}</strong> to the original payment method you paid with. It usually appears within 5 to 10 working days, and you do not need to contact us or do anything else.`,
      'point-of-sale':
        'You bought these tickets at a partner point of sale, so the refund is made there. Please take your ticket back to the desk you bought it at and they will return the money.',
      none: 'These were complimentary tickets, so there is nothing to refund.',
    },
    future: 'Our remaining performances this season are listed on our official website:',
    signoff: 'With our apologies,',
    org: 'Moreška by HGD Sveta Cecilija',
    footer:
      "You're receiving this because you hold a ticket for this performance. Legal entity: HGD Sveta Cecilija, Korčula, Croatia. Contact:",
  },
  hr: {
    subject: 'Vaša Moreška izvedba je otkazana',
    heading: 'Izvedba je otkazana',
    greeting: (name: string) => `Poštovani ${name},`,
    intro:
      'Jako nam je žao. Ova izvedba Moreške (mačevni ples) je otkazana i neće se održati. Vaše ulaznice za nju više ne vrijede.',
    money: {
      refund: (amount: string) =>
        `Cijeli iznos od <strong>${amount}</strong> vratili smo na isti način plaćanja kojim ste platili. Novac je obično vidljiv u roku od 5 do 10 radnih dana, a vi ne morate ništa poduzimati ni nas kontaktirati.`,
      'point-of-sale':
        'Ulaznice ste kupili na partnerskom prodajnom mjestu, pa se povrat novca obavlja ondje. Molimo vas da ulaznicu odnesete natrag na mjesto gdje ste je kupili i novac će vam biti vraćen.',
      none: 'Ulaznice su bile besplatne, pa nema iznosa za povrat.',
    },
    future: 'Preostale izvedbe ove sezone možete vidjeti na našoj službenoj stranici:',
    signoff: 'Uz ispriku,',
    org: 'Moreška by HGD Sveta Cecilija',
    footer:
      'Ovu poruku primate jer imate ulaznicu za ovu izvedbu. Pravna osoba: HGD Sveta Cecilija, Korčula, Hrvatska. Kontakt:',
  },
} as const

// Weekday + date, localised, matching the ticket email and the PDF. Anchored at
// T00:00:00Z + timeZone UTC so a bare YYYY-MM-DD never slips a day.
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

// The venue is named so a buyer holding tickets for several evenings knows
// exactly which one is gone. In English we append the on-the-ground Croatian
// name in parens (that is what the signage in Korčula says), and ", Korčula"
// unless the name already carries the town.
function venueLine(venue: Venue, locale: 'en' | 'hr'): string {
  const en = VENUE_LABEL.en[venue]
  const hr = VENUE_LABEL.hr[venue]
  const base = locale === 'hr' ? hr : en === hr ? en : `${en} (${hr})`
  return base.includes('Korčula') ? base : `${base}, Korčula`
}

function moneyLine(input: SendShowCancelledEmailInput, locale: 'en' | 'hr'): string {
  const c = COPY[locale]
  if (input.mode === 'refund') return c.money.refund(formatEur(input.amountCents ?? 0))
  return c.money[input.mode]
}

function renderHtml(input: SendShowCancelledEmailInput, locale: 'en' | 'hr'): string {
  const { buyer, show } = input
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

  const dateLabel = `${formatDate(show.date, locale)} · ${show.time}`
  // The cancelled evening is struck through: one glance says which date is gone,
  // in the same visual language the reschedule notice uses for the old date.
  const cancelledBox = `display:inline-block;padding:8px 16px;background:#f3f0ea;border:1px solid ${border};border-radius:2px;font-weight:700;font-size:17px;color:#9a9a9a;text-decoration:line-through;`
  const linkStyle = `color:${gold};font-weight:700;text-decoration:underline;`

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

        <!-- body: heading + apology -->
        <tr><td style="padding:36px 44px 6px 44px;background:#ffffff;">
          <h1 style="font-family:${fontHeading};font-size:28px;line-height:1.2;margin:0 0 20px 0;color:${ink};text-align:center;">${c.heading}</h1>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:${bodyText};">${c.greeting(buyer.name)}</p>
          <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;color:${bodyText};">${c.intro}</p>
        </td></tr>

        <!-- the cancelled evening -->
        <tr><td align="center" style="padding:14px 44px 4px 44px;background:#ffffff;">
          <div style="${cancelledBox}">${dateLabel}</div>
          <div style="margin-top:12px;font-size:14px;line-height:1.5;color:${muted};">${venueLine(show.venue, locale)}</div>
        </td></tr>

        <!-- the money -->
        <tr><td style="padding:20px 44px 6px 44px;background:#ffffff;">
          <p style="margin:0;font-size:16px;line-height:1.6;color:${bodyText};">${moneyLine(input, locale)}</p>
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

        <!-- remaining performances (plain link, not a CTA) -->
        <tr><td align="center" style="padding:2px 44px 10px 44px;background:#ffffff;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:${muted};">${c.future}<br/>
            <a href="${TICKETS_URL}" style="${linkStyle}">${TICKETS_URL_DISPLAY}</a>
          </p>
        </td></tr>

        <!-- sign-off -->
        <tr><td style="padding:10px 44px 34px 44px;background:#ffffff;">
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

export async function sendShowCancelledEmail(
  input: SendShowCancelledEmailInput,
  deps: SendShowCancelledEmailDeps,
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
        `[sendShowCancelledEmail] Brevo error orderId=${input.orderId} email=${input.buyer.email} status=${res.status} body=${txt}`,
      )
      return false
    }
    return true
  } catch (err) {
    console.error(
      `[sendShowCancelledEmail] fetch failed orderId=${input.orderId} email=${input.buyer.email} error=${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return false
  }
}

// Exposed for the admin "send test to me" step so the secretary can read exactly
// what buyers will receive before anything irreversible goes out.
export function renderShowCancelledPreview(
  input: SendShowCancelledEmailInput,
  locale: 'en' | 'hr',
): { subject: string; html: string } {
  return { subject: COPY[locale].subject, html: renderHtml(input, locale) }
}
