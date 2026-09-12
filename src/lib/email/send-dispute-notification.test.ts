import { describe, it, expect, vi } from 'vitest'
import { sendDisputeNotification } from './send-dispute-notification'
import { BREVO_EMAIL_ENDPOINT } from './post-brevo-email'

const ok = () => new Response('{}', { status: 201 })

function lastBody(fetch: ReturnType<typeof vi.fn>) {
  const init = fetch.mock.calls[0][1] as RequestInit
  return JSON.parse(init.body as string)
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    disputeId: 'du_1U6QjU2LKHW8z1M1XiwGowiJ',
    paymentIntentId: 'pi_123',
    amountCents: 4000,
    currency: 'eur',
    reason: 'product_not_received',
    status: 'needs_response',
    evidenceDueBy: '2026-08-30T23:59:59.000Z',
    order: {
      id: '659',
      code: 'AB23',
      buyerName: 'Serena Salvi',
      email: 'serena@example.com',
      total: 4000,
    },
    ...overrides,
  } as Parameters<typeof sendDisputeNotification>[0]
}

describe('sendDisputeNotification', () => {
  it('mails the org inbox from the verified sender, through the Brevo seam', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())

    await sendDisputeNotification(input(), { fetch, brevoApiKey: 'k', devEmailOverride: null })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][0]).toBe(BREVO_EMAIL_ENDPOINT)
    const body = lastBody(fetch)
    expect(body.sender.email).toBe('tickets@moreska.eu')
    expect(body.to).toEqual([{ email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' }])
  })

  it('names the order code, the amount and the evidence deadline', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())

    await sendDisputeNotification(input(), { fetch, brevoApiKey: 'k', devEmailOverride: null })

    const body = lastBody(fetch)
    expect(body.subject).toContain('AB23')
    expect(body.subject).toContain('40.00 EUR')
    expect(body.htmlContent).toContain('2026-08-30 23:59 UTC')
    expect(body.htmlContent).toContain('product_not_received')
    expect(body.htmlContent).toContain('du_1U6QjU2LKHW8z1M1XiwGowiJ')
    expect(body.htmlContent).toContain('Serena Salvi')
  })

  it('flags an unmatched dispute instead of pretending it belongs to an order', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())

    await sendDisputeNotification(input({ order: null }), {
      fetch,
      brevoApiKey: 'k',
      devEmailOverride: null,
    })

    const body = lastBody(fetch)
    expect(body.subject).toContain('UNKNOWN ORDER')
  })

  it('says so when Stripe gave no evidence deadline', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())

    await sendDisputeNotification(input({ evidenceDueBy: null }), {
      fetch,
      brevoApiKey: 'k',
      devEmailOverride: null,
    })

    expect(lastBody(fetch).htmlContent).toContain('not stated by Stripe')
  })

  it('escapes buyer-controlled text', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())

    await sendDisputeNotification(
      input({
        order: {
          id: '1',
          code: null,
          buyerName: '<script>alert(1)</script>',
          email: 'x@example.com',
          total: 2000,
        },
      }),
      { fetch, brevoApiKey: 'k', devEmailOverride: null },
    )

    const html = lastBody(fetch).htmlContent
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('throws when Brevo rejects the send', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 400 }))

    await expect(
      sendDisputeNotification(input(), { fetch, brevoApiKey: 'k', devEmailOverride: null }),
    ).rejects.toThrow(/status=400/)
  })
})
