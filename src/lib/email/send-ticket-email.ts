import type { Venue } from '../venues'
import { renderTicketEmail } from './render-ticket-email'
import { renderTicketsPdf } from './render-tickets-pdf'
import { renderIcs, googleCalendarLink } from './render-ics'

export interface SendTicketEmailInput {
  orderId: string
  buyer: { name: string; email: string }
  show: { date: string; time: string; venue: Venue }
  order: { adultCount: number; childCount: number; total: number }
  token: string
  locale: 'en' | 'hr'
}

export interface SendTicketEmailDeps {
  fetch: typeof fetch
  generateQrPng: (data: string) => Promise<Buffer>
  brevoApiKey: string
  renderTicketsPdf?: typeof renderTicketsPdf
  renderTicketEmail?: typeof renderTicketEmail
}

function pdfFilename(date: string): string {
  return `moreska-tickets-${date}.pdf`
}

function icsFilename(date: string): string {
  return `moreska-${date}.ics`
}

export async function sendTicketEmail(
  input: SendTicketEmailInput,
  deps: SendTicketEmailDeps,
): Promise<void> {
  const renderPdf = deps.renderTicketsPdf ?? renderTicketsPdf
  const renderEmail = deps.renderTicketEmail ?? renderTicketEmail

  try {
    const gcalUrl = googleCalendarLink({
      orderId: input.orderId,
      show: input.show,
      locale: input.locale,
    })
    const { html, subject } = await renderEmail({
      buyer: input.buyer,
      show: input.show,
      order: input.order,
      locale: input.locale,
      orderRef: input.orderId,
      gcalUrl,
    })

    const icsContent = renderIcs({
      orderId: input.orderId,
      show: input.show,
      locale: input.locale,
    })

    const pdfBuffer = await renderPdf(
      {
        buyer: input.buyer,
        show: input.show,
        order: input.order,
        token: input.token,
        locale: input.locale,
        orderRef: input.orderId,
      },
      { generateQrPng: deps.generateQrPng },
    )

    const body = {
      sender: { email: 'tickets@moreska.eu', name: 'HGD Sveta Cecilija' },
      replyTo: { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' },
      to: [{ email: input.buyer.email, name: input.buyer.name }],
      subject,
      htmlContent: html,
      attachment: [
        {
          name: pdfFilename(input.show.date),
          content: pdfBuffer.toString('base64'),
        },
        {
          name: icsFilename(input.show.date),
          content: Buffer.from(icsContent, 'utf8').toString('base64'),
        },
      ],
    }

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
      // Prefix fields so failures are grep-able (`orderId=`) for manual resend.
      console.error(
        `[sendTicketEmail] Brevo error orderId=${input.orderId} email=${input.buyer.email} token=${input.token} status=${res.status} body=${text}`,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[sendTicketEmail] fetch failed orderId=${input.orderId} email=${input.buyer.email} token=${input.token} error=${msg}`,
    )
  }
}
