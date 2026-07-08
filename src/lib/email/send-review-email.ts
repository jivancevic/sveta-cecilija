// Brevo transactional sender for the post-show review-request email (T+1.5h).
// Same shape as send-ticket-email / send-refund-email — pure POST, EN+HR,
// fire-and-forget with grep-able failure logs.
//
// Marketing-class mail (#57): carries a one-click unsubscribe footer link plus
// RFC 8058 List-Unsubscribe / List-Unsubscribe-Post headers so Gmail/Apple
// Mail surface a native "Unsubscribe" affordance and Postmaster guidelines
// for bulk senders are met.
import { postBrevoEmail } from './post-brevo-email'

export interface SendReviewEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  locale?: 'en' | 'hr'
  tripadvisorUrl: string
  googleReviewUrl: string
  // Pre-signed one-click unsubscribe URL for this buyer's email. Omitted only
  // if the caller could not build it (no PAYLOAD_SECRET) — the mail still
  // sends, just without the List-Unsubscribe affordance.
  unsubscribeUrl?: string
}

export interface SendReviewEmailDeps {
  fetch: typeof fetch
  brevoApiKey: string
  /**
   * Consent gate (#57). Returns true if this buyer opted out of marketing-class
   * mail. Required — making it part of the send's interface means a post-show
   * email cannot be sent without a consent check, even by a future caller that
   * doesn't replicate the dispatcher's opt-out SQL pre-filter. Wire it to
   * `isEmailOptedOut` from src/lib/marketing/opt-out.ts. If it throws (store
   * unreachable) the send aborts and propagates, so the caller can retry rather
   * than risk mailing an opted-out address.
   */
  isOptedOut: (email: string) => Promise<boolean>
}

// Brand layer per ADR-0003: "Moreška by HGD Sveta Cecilija" in sender name +
// subject; legal entity "HGD Sveta Cecilija" preserved in footer.
//
// Marketing-class mail sends from the authenticated bilten.moreska.eu subdomain
// (ADR-0004, #56) to isolate its reputation from transactional ticket mail on
// root moreska.eu. Reply-To stays info@moreska.eu so buyer replies reach the
// real inbox (the From mailbox is send-only).
const SENDER = { email: 'newsletter@bilten.moreska.eu', name: 'Moreška by HGD Sveta Cecilija' }
const REPLY_TO = { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' }

function renderSubject(locale: 'en' | 'hr'): string {
  return locale === 'hr'
    ? 'Bili ste dio priče duge stoljećima'
    : 'You were part of something centuries old'
}

// Public brand assets, served from prod. Email clients don't render webp
// reliably (Outlook), so these are dedicated PNG copies under public/email/.
const ASSET_BASE = 'https://moreska.eu/email'

interface ReviewCopy {
  preheader: string
  heading: string
  greeting: (name: string) => string
  thanks: string[] // gratitude paragraphs — the focus of the email
  reviewLead: string // the ask, right before the buttons
  tripadvisorLabel: string
  googleLabel: string
  signoff: string // may contain <br/>
  footer: string // legal line; MUST keep "Legal entity: HGD Sveta Cecilija" (EN)
  unsub: (url: string) => string
}

const COPY: Record<'en' | 'hr', ReviewCopy> = {
  en: {
    preheader: 'Thank you for coming to the Moreška. It meant a lot to have you with us.',
    heading: 'Thank you for being here',
    greeting: (name) => `Dear ${name},`,
    thanks: [
      'You came to see the Moreška, a sword dance Korčula has kept alive for centuries: the drums, the two kings, and Bula at the heart of the fight. We are grateful you were part of it.',
      'The dance lives because people still come to watch it. Every full square, every guest who stays to the last clash of swords, carries it on to the next generation. So, truly: thank you for being here.',
    ],
    reviewLead:
      'If it stayed with you, a few words would mean the world to us. Your review helps other travellers find the real Moreška, in the town where it began.',
    tripadvisorLabel: 'Review on TripAdvisor',
    googleLabel: 'Review on Google',
    signoff: 'With gratitude,<br/>HGD Sveta Cecilija',
    footer:
      "You're receiving this because you bought a ticket from HGD Sveta Cecilija. Legal entity: HGD Sveta Cecilija, Korčula, Croatia. You can reach us any time at <a href=\"mailto:info@moreska.eu\" style=\"color:#b9b2a6;\">info@moreska.eu</a>.",
    unsub: (url) =>
      ` If you'd rather not hear from us again, <a href="${url}" style="color:#b9b2a6;text-decoration:underline;">unsubscribe here</a>.`,
  },
  hr: {
    preheader: 'Hvala Vam što ste došli na morešku. Bilo nam je drago što ste bili s nama.',
    heading: 'Hvala Vam što ste bili s nama',
    greeting: (name) => `Poštovani ${name},`,
    thanks: [
      'Došli ste vidjeti morešku, viteški mačevalački ples koji Korčula čuva već stoljećima: glazbu, dva kralja, vojske i Bulu. Drago nam je što ste bili dio te priče.',
      'Moreška živi jer ju ljudi i dalje dolaze gledati. Svaka osoba koja ostane do posljednjeg udarca mačeva prenosi ju novim naraštajima. Zato, iskreno: hvala Vam.',
    ],
    reviewLead:
      'Ako Vam je ostala u sjećanju, par riječi značilo bi nam jako puno. Vaša recenzija pomaže drugim posjetiteljima da pronađu pravu morešku, u gradu u kojem je ostala.',
    tripadvisorLabel: 'Recenzija na TripAdvisoru',
    googleLabel: 'Recenzija na Googleu',
    signoff: 'Sa zahvalnošću,<br/>HGD Sveta Cecilija',
    footer:
      'Ovu poruku primate jer ste kupili ulaznicu kod HGD Sveta Cecilija. Pravna osoba: HGD Sveta Cecilija, Korčula, Hrvatska. Uvijek nam se možete javiti na <a href="mailto:info@moreska.eu" style="color:#b9b2a6;">info@moreska.eu</a>.',
    unsub: (url) =>
      ` Ako više ne želite primati ovakve poruke, <a href="${url}" style="color:#b9b2a6;text-decoration:underline;">odjavite se ovdje</a>.`,
  },
}

function renderHtml(input: SendReviewEmailInput, locale: 'en' | 'hr'): string {
  const { buyer, tripadvisorUrl, googleReviewUrl, unsubscribeUrl } = input
  const c = COPY[locale]

  // Brand tokens mirrored from globals.css ("Tempered Silence": near-black ink,
  // warm cream, gold). Inline because email clients strip <link>/external CSS.
  // Single-quote the family names: these strings sit inside double-quoted
  // style="…" attributes, so a double-quoted "Segoe UI" would close the
  // attribute early and drop every declaration after it (e.g. button colours).
  const fontHeading = `'Bodoni Moda SC', 'Bodoni Moda', Georgia, serif`
  const fontBody = `Inter, -apple-system, 'Segoe UI', Arial, sans-serif`
  const gold = '#b48a3c' // --gold token
  const ink = '#1a1a1a'
  const cream = '#faf6ef'
  const border = '#e6dfd1'
  const bodyText = '#3d372f'
  const muted = '#6b6257'

  const paragraphs = c.thanks
    .map(
      (p) =>
        `<p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:${bodyText};">${p}</p>`,
    )
    .join('\n      ')

  // Two-tone CTA pair: TripAdvisor filled gold, Google filled ink, each led by
  // a white platform glyph. Bulletproof padded anchors (no VML) — fine for the
  // mobile Gmail/Apple Mail audience.
  const btnBase = `display:inline-block;padding:14px 26px;margin:6px;text-decoration:none;font-family:${fontBody};font-weight:600;font-size:15px;letter-spacing:0.02em;border-radius:3px;`
  const icon = (name: string) =>
    `<img src="${ASSET_BASE}/icon-${name}.png" alt="" width="18" height="18" style="vertical-align:middle;margin-right:12px;" />`
  const taButton = `<a href="${tripadvisorUrl}" style="${btnBase}background:${gold};color:#ffffff;">${icon('tripadvisor')}${c.tripadvisorLabel}</a>`
  const googleButton = `<a href="${googleReviewUrl}" style="${btnBase}background:${ink};color:#ffffff;">${icon('google')}${c.googleLabel}</a>`

  const unsub = unsubscribeUrl ? c.unsub(unsubscribeUrl) : ''

  return `
<div style="margin:0;padding:0;background:${cream};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${cream};font-size:1px;line-height:1px;">${c.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${cream};font-family:${fontBody};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${border};border-radius:4px;overflow:hidden;">

        <!-- gold top rule -->
        <tr><td style="height:4px;background:${gold};font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- header: full-colour crest on cream (the crest already carries the
             HGD SV. CECILIJA · KORČULA wordmark, so no repeated text line) -->
        <tr><td align="center" style="background:${cream};padding:28px 32px 26px 32px;border-bottom:1px solid ${border};">
          <img src="${ASSET_BASE}/logo.png" alt="HGD Sveta Cecilija - Korčula" height="88" style="display:block;height:88px;width:auto;margin:0 auto;" />
        </td></tr>

        <!-- body: thank-you copy is the focus -->
        <tr><td style="padding:38px 44px 8px 44px;background:#ffffff;">
          <h1 style="font-family:${fontHeading};font-size:30px;line-height:1.2;margin:0 0 22px 0;color:${ink};text-align:center;">${c.heading}</h1>
          <p style="margin:0 0 18px 0;font-size:16px;line-height:1.6;color:${bodyText};">${c.greeting(buyer.name)}</p>
      ${paragraphs}
        </td></tr>

        <!-- crossed-swords divider, flanked by gold hairlines -->
        <tr><td style="padding:10px 44px 18px 44px;background:#ffffff;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="border-bottom:1px solid #e6dcc4;font-size:0;line-height:0;">&nbsp;</td>
              <td width="72" style="padding:0 16px;">
                <img src="${ASSET_BASE}/swords.png" alt="" width="40" style="display:block;width:40px;height:auto;margin:0 auto;" />
              </td>
              <td style="border-bottom:1px solid #e6dcc4;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
          </table>
        </td></tr>

        <!-- the review ask, then the buttons, at the end -->
        <tr><td style="padding:0 44px 4px 44px;background:#ffffff;">
          <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:${muted};text-align:center;">${c.reviewLead}</p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 30px 32px;background:#ffffff;">
          ${taButton}
          ${googleButton}
        </td></tr>

        <!-- sign-off -->
        <tr><td style="padding:0 44px 34px 44px;background:#ffffff;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:${muted};">${c.signoff}</p>
        </td></tr>

        <!-- footer: near-black band -->
        <tr><td style="padding:22px 44px;background:${ink};font-size:12px;line-height:1.6;color:#b9b2a6;">
          ${c.footer}${unsub}
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>
`.trim()
}

export async function sendReviewEmail(
  input: SendReviewEmailInput,
  deps: SendReviewEmailDeps,
): Promise<void> {
  // Consent gate first — this is the authoritative opt-out check for the
  // post-show class (#57). A store-read failure propagates (caller retries);
  // an opted-out buyer is skipped, never mailed. The dispatcher also pre-filters
  // opt-outs in SQL for efficiency, but this is what makes the *send* safe.
  if (await deps.isOptedOut(input.buyer.email)) {
    console.log(
      `[sendReviewEmail] skipped opted-out buyer orderId=${input.orderId} email=${input.buyer.email}`,
    )
    return
  }

  const locale = input.locale ?? 'en'
  // RFC 2369 / RFC 8058: a mailto fallback plus the one-click HTTPS endpoint.
  // List-Unsubscribe-Post tells the client it may POST without confirmation.
  const headers = input.unsubscribeUrl
    ? {
        'List-Unsubscribe': `<mailto:info@moreska.eu?subject=unsubscribe>, <${input.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
    : undefined
  const body = {
    sender: SENDER,
    replyTo: REPLY_TO,
    to: [{ email: input.buyer.email, name: input.buyer.name }],
    subject: renderSubject(locale),
    htmlContent: renderHtml(input, locale),
    ...(headers ? { headers } : {}),
  }
  try {
    const res = await postBrevoEmail(body, {
      fetch: deps.fetch,
      brevoApiKey: deps.brevoApiKey,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // Grep-able failure log — orderId+email lets you re-send manually by
      // clearing review_email_sent_at and re-running the cron.
      console.error(
        `[sendReviewEmail] Brevo error orderId=${input.orderId} email=${input.buyer.email} status=${res.status} body=${text}`,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[sendReviewEmail] fetch failed orderId=${input.orderId} email=${input.buyer.email} error=${msg}`,
    )
  }
}
