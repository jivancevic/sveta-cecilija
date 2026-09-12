import { describe, it, expect, vi } from 'vitest'
import {
  renderShowCancelledPreview,
  sendShowCancelledEmail,
  type SendShowCancelledEmailInput,
} from './send-show-cancelled-email'

const base: SendShowCancelledEmailInput = {
  orderId: '10',
  buyer: { name: 'Ana Horvat', email: 'ana@example.com' },
  show: { date: '2026-07-23', time: '21:00', venue: 'ljetno-kino' },
  mode: 'refund',
  amountCents: 4000,
}

describe('renderShowCancelledPreview', () => {
  it('names the buyer and the evening that is gone (EN)', () => {
    const { html, subject } = renderShowCancelledPreview(base, 'en')
    expect(subject).toMatch(/cancelled/i)
    expect(html).toContain('Ana Horvat')
    expect(html).toContain('Thursday, 23 July 2026')
    expect(html).toContain('21:00')
    // A buyer holding tickets for several evenings has to be able to tell which.
    expect(html).toContain('Summer Cinema')
  })

  it('names the evening in Croatian too', () => {
    const { html, subject } = renderShowCancelledPreview({ ...base, locale: 'hr' }, 'hr')
    expect(subject).toMatch(/otkazana/i)
    expect(html).toMatch(/23\. srpnja 2026/)
    expect(html).toContain('Ljetno kino')
  })

  it('states the refunded amount and the ORIGINAL payment method, never "your card"', () => {
    const en = renderShowCancelledPreview(base, 'en').html
    expect(en).toContain('€40.00')
    expect(en).toMatch(/original payment method/i)
    expect(en.toLowerCase()).not.toContain('your card')

    const hr = renderShowCancelledPreview({ ...base, locale: 'hr' }, 'hr').html
    expect(hr).toContain('€40.00')
    expect(hr).toMatch(/isti način plaćanja/i)
  })

  it('sends a partner buyer back to the desk that charged them, with no amount', () => {
    const { html } = renderShowCancelledPreview({ ...base, mode: 'point-of-sale' }, 'en')
    expect(html).toMatch(/partner point of sale/i)
    expect(html).not.toContain('€40.00')

    const hr = renderShowCancelledPreview({ ...base, mode: 'point-of-sale', locale: 'hr' }, 'hr').html
    expect(hr).toMatch(/partnerskom prodajnom mjestu/i)
  })

  it('tells a comp guest there is nothing to refund', () => {
    expect(renderShowCancelledPreview({ ...base, mode: 'none' }, 'en').html).toMatch(/nothing to refund/i)
    expect(renderShowCancelledPreview({ ...base, mode: 'none', locale: 'hr' }, 'hr').html).toMatch(
      /nema iznosa za povrat/i,
    )
  })

  it('carries no call to action beyond the plain site link', () => {
    const { html } = renderShowCancelledPreview(base, 'en')
    expect(html).toContain('moreska.eu/tickets')
    // Selling the next evening on the message that cancels this one reads as a
    // pitch, so there is no button at all.
    expect(html).not.toMatch(/display:inline-block;padding:12px 24px/)
  })
})

describe('sendShowCancelledEmail', () => {
  const ok = { ok: true, status: 201, text: async () => '' } as unknown as Response

  it('sends one message to one buyer from tickets@, replying to info@', async () => {
    const fetchMock = vi.fn<(...a: unknown[]) => Promise<Response>>(async () => ok)
    const sent = await sendShowCancelledEmail(base, { fetch: fetchMock as unknown as typeof fetch, brevoApiKey: 'k' })

    expect(sent).toBe(true)
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body.to).toEqual([{ email: 'ana@example.com', name: 'Ana Horvat' }])
    expect(body.sender.email).toBe('tickets@moreska.eu')
    expect(body.replyTo.email).toBe('info@moreska.eu')
  })

  it('reports a Brevo rejection as false rather than throwing, so the caller can retry it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, text: async () => 'quota' }) as unknown as Response)
    await expect(
      sendShowCancelledEmail(base, { fetch: fetchMock as unknown as typeof fetch, brevoApiKey: 'k' }),
    ).resolves.toBe(false)
  })

  it('reports a network failure as false too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    await expect(
      sendShowCancelledEmail(base, { fetch: fetchMock as unknown as typeof fetch, brevoApiKey: 'k' }),
    ).resolves.toBe(false)
  })
})
