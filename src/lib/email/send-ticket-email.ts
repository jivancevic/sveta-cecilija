import type { Venue } from '../venues'

const VENUE_LABEL: Record<'en' | 'hr', Record<Venue, string>> = {
  en: { 'ljetno-kino': 'Summer Cinema', 'zimsko-kino': 'Cultural Center Korčula' },
  hr: { 'ljetno-kino': 'Ljetno kino', 'zimsko-kino': 'Centar za kulturu' },
}

function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

function renderSubject(locale: 'en' | 'hr', date: string): string {
  return locale === 'hr'
    ? `Vaše ulaznice za morešku — ${date}`
    : `Your Moreška tickets — ${date}`
}

function renderHtml(input: SendTicketEmailInput): string {
  const { buyer, show, order, locale } = input
  const venueLabel = VENUE_LABEL[locale][show.venue]

  if (locale === 'hr') {
    return `
      <p>Poštovani ${buyer.name},</p>
      <p>Vaše ulaznice za morešku priložene su kao QR kodovi — jedan po ulaznici.</p>
      <h3>Sažetak narudžbe</h3>
      <ul>
        <li>${order.adultCount} odraslih × €20</li>
        <li>${order.childCount} djece × €10</li>
        <li><strong>Ukupno plaćeno: ${formatEur(order.total)}</strong></li>
      </ul>
      <h3>Detalji predstave</h3>
      <ul>
        <li>Datum: ${show.date}</li>
        <li>Vrijeme: ${show.time}</li>
        <li>Mjesto: ${venueLabel}</li>
      </ul>
      <p><em>Povrat novca na zahtjev kupca nije moguć, no ulaznice su 100% povratne ako organizator otkaže predstavu.</em></p>
    `.trim()
  }

  return `
    <p>Hi ${buyer.name},</p>
    <p>Your Moreška tickets are attached as QR codes — one per ticket.</p>
    <h3>Order summary</h3>
    <ul>
      <li>${order.adultCount} adult × €20</li>
      <li>${order.childCount} child × €10</li>
      <li><strong>Total paid: ${formatEur(order.total)}</strong></li>
    </ul>
    <h3>Show details</h3>
    <ul>
      <li>Date: ${show.date}</li>
      <li>Time: ${show.time}</li>
      <li>Venue: ${venueLabel}</li>
    </ul>
    <p><em>Tickets are non-refundable by customer choice but 100% refundable if the show is cancelled by the organiser.</em></p>
  `.trim()
}

export interface SendTicketEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  show: { date: string; time: string; venue: Venue }
  order: { adultCount: number; childCount: number; total: number }
  tokens: string[]
  locale: 'en' | 'hr'
}

export interface SendTicketEmailDeps {
  fetch: typeof fetch
  generateQrPng: (data: string) => Promise<Buffer>
  brevoApiKey: string
}

export async function sendTicketEmail(
  input: SendTicketEmailInput,
  deps: SendTicketEmailDeps,
): Promise<void> {
  const attachment = await Promise.all(
    input.tokens.map(async (token, i) => {
      const png = await deps.generateQrPng(`https://moreska.eu/scan/${token}`)
      return { name: `ticket-${i + 1}.png`, content: png.toString('base64') }
    }),
  )

  const body = {
    sender: { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' },
    to: [{ email: input.buyer.email, name: input.buyer.name }],
    subject: renderSubject(input.locale, input.show.date),
    htmlContent: renderHtml(input),
    attachment,
  }
  try {
    const res = await deps.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': deps.brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // Prefix fields so failures are grep-able (`orderId=`) for manual resend
      // — see #6 mitigation: Brevo 5xx on the only attempt would otherwise
      // silently lose the buyer's tickets.
      console.error(
        `[sendTicketEmail] Brevo error orderId=${input.orderId} email=${input.buyer.email} tokens=${input.tokens.length} status=${res.status} body=${text}`,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[sendTicketEmail] fetch failed orderId=${input.orderId} email=${input.buyer.email} tokens=${input.tokens.length} error=${msg}`,
    )
  }
}
