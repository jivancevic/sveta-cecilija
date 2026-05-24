import { describe, it, expect, vi } from 'vitest'
import { sendTicketEmail, type SendTicketEmailDeps } from './send-ticket-email'

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    buyer: { name: 'Ana Anić', email: 'ana@example.com' },
    show: {
      date: '2026-07-15',
      time: '21:00',
      venue: 'ljetno-kino' as const,
    },
    order: { adultCount: 2, childCount: 1, total: 5000 },
    tokens: ['tok_a', 'tok_b', 'tok_c'],
    locale: 'en' as const,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<SendTicketEmailDeps> = {}): SendTicketEmailDeps {
  return {
    fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 201 })),
    generateQrPng: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    brevoApiKey: 'test-key',
    ...overrides,
  }
}

describe('sendTicketEmail', () => {
  it('POSTs to Brevo transactional email endpoint with api-key header', async () => {
    const deps = makeDeps()
    await sendTicketEmail(makeInput(), deps)

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect(init.method).toBe('POST')
    expect(init.headers['api-key']).toBe('test-key')
    expect(init.headers['content-type']).toBe('application/json')
  })
})
