import type { Venue } from '../venues'

export interface SendTicketEmailInput {
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
  _input: SendTicketEmailInput,
  deps: SendTicketEmailDeps,
): Promise<void> {
  await deps.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': deps.brevoApiKey,
      'content-type': 'application/json',
    },
    body: '{}',
  })
}
