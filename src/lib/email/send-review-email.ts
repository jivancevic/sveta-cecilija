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
  return locale === 'hr' ? 'Kako Vam se svidjela Moreška?' : 'How was Moreška?'
}

function renderHtml(input: SendReviewEmailInput, locale: 'en' | 'hr'): string {
  const { buyer, tripadvisorUrl, googleReviewUrl, unsubscribeUrl } = input

  const unsubHr = unsubscribeUrl
    ? ` Ako se želite odjaviti od ovakvih poruka, <a href="${unsubscribeUrl}" style="color:#888;">odjavite se ovdje</a>.`
    : ''
  const unsubEn = unsubscribeUrl
    ? ` To stop receiving these, <a href="${unsubscribeUrl}" style="color:#888;">unsubscribe here</a>.`
    : ''

  // Brand fonts mirrored from globals.css. Inline because email clients
  // strip <link>/external CSS — keep tokens centralised here.
  const fontHeading = `"Bodoni Moda SC", "Bodoni Moda", Georgia, serif`
  const fontBody = `Inter, -apple-system, "Segoe UI", Arial, sans-serif`
  const gold = '#b48a3c' // matches --gold token in .t-stone
  const bg = '#faf6ef'
  const text = '#1a1a1a'

  const buttonStyle = `display:inline-block;padding:14px 28px;margin:8px 6px;background:${gold};color:#fff;text-decoration:none;font-family:${fontBody};font-weight:600;font-size:15px;letter-spacing:0.02em;border-radius:2px;`

  if (locale === 'hr') {
    return `
<div style="background:${bg};padding:32px 16px;font-family:${fontBody};color:${text};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6dfd1;">
    <tr><td style="padding:36px 32px 12px 32px;">
      <h1 style="font-family:${fontHeading};font-size:28px;line-height:1.2;margin:0 0 16px 0;color:${text};">Hvala što ste bili s nama</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Poštovani ${buyer.name},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Nadamo se da Vam se naša Moreška svidjela. Jako bi nam značilo ako Vam dvije minute izdvojite za kratku recenziju. Vaša priča pomaže drugim posjetiteljima da pronađu autentičnu Morešku.</p>
    </td></tr>
    <tr><td align="center" style="padding:8px 32px 24px 32px;">
      <a href="${tripadvisorUrl}" style="${buttonStyle}">Recenzija na TripAdvisoru</a>
      <a href="${googleReviewUrl}" style="${buttonStyle}">Recenzija na Googleu</a>
    </td></tr>
    <tr><td style="padding:0 32px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.55;color:#555;">Srdačan pozdrav,<br/>Moreška by HGD Sveta Cecilija</p>
    </td></tr>
    <tr><td style="padding:16px 32px;border-top:1px solid #e6dfd1;font-size:11px;color:#888;line-height:1.5;">
      Ovaj email je poslan jer ste kupili ulaznicu kod HGD Sveta Cecilija. Pravna osoba: HGD Sveta Cecilija, Korčula, Hrvatska. Možete nam pisati na <a href="mailto:info@moreska.eu" style="color:#888;">info@moreska.eu</a>.${unsubHr}
    </td></tr>
  </table>
</div>
`.trim()
  }

  return `
<div style="background:${bg};padding:32px 16px;font-family:${fontBody};color:${text};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6dfd1;">
    <tr><td style="padding:36px 32px 12px 32px;">
      <h1 style="font-family:${fontHeading};font-size:28px;line-height:1.2;margin:0 0 16px 0;color:${text};">Thank you for being with us</h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">Hi ${buyer.name},</p>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;">We hope you enjoyed the Moreška. It would mean a great deal if you could spare two minutes to leave a short review. Your story helps other visitors find the original Moreška.</p>
    </td></tr>
    <tr><td align="center" style="padding:8px 32px 24px 32px;">
      <a href="${tripadvisorUrl}" style="${buttonStyle}">Review on TripAdvisor</a>
      <a href="${googleReviewUrl}" style="${buttonStyle}">Review on Google</a>
    </td></tr>
    <tr><td style="padding:0 32px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.55;color:#555;">With thanks,<br/>Moreška by HGD Sveta Cecilija</p>
    </td></tr>
    <tr><td style="padding:16px 32px;border-top:1px solid #e6dfd1;font-size:11px;color:#888;line-height:1.5;">
      You're receiving this because you purchased a ticket from HGD Sveta Cecilija. Legal entity: HGD Sveta Cecilija, Korčula, Croatia. You can reach us at <a href="mailto:info@moreska.eu" style="color:#888;">info@moreska.eu</a>.${unsubEn}
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
