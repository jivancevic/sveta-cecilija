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

  it('sends from info@moreska.eu to the buyer with subject referencing the show date', async () => {
    const deps = makeDeps()
    await sendTicketEmail(makeInput(), deps)

    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.sender.email).toBe('info@moreska.eu')
    expect(body.to).toEqual([{ email: 'ana@example.com', name: 'Ana Anić' }])
    expect(body.subject).toMatch(/Moreška/)
    expect(body.subject).toContain('2026-07-15')
  })

  it('includes one inline QR attachment per token, each encoding the scan URL', async () => {
    const deps = makeDeps({
      generateQrPng: vi.fn(async (data: string) =>
        Buffer.from(`png-for-${data}`),
      ),
    })
    await sendTicketEmail(makeInput(), deps)

    expect(deps.generateQrPng).toHaveBeenCalledTimes(3)
    expect(deps.generateQrPng).toHaveBeenNthCalledWith(1, 'https://moreska.eu/scan/tok_a')
    expect(deps.generateQrPng).toHaveBeenNthCalledWith(2, 'https://moreska.eu/scan/tok_b')
    expect(deps.generateQrPng).toHaveBeenNthCalledWith(3, 'https://moreska.eu/scan/tok_c')

    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.attachment).toHaveLength(3)
    expect(body.attachment[0].name).toBe('ticket-1.png')
    expect(Buffer.from(body.attachment[0].content, 'base64').toString()).toBe('png-for-https://moreska.eu/scan/tok_a')
    expect(body.attachment[2].name).toBe('ticket-3.png')
  })

  it('HTML body contains buyer name, ticket counts, EUR total, show details, and refund policy (en)', async () => {
    const deps = makeDeps()
    await sendTicketEmail(makeInput(), deps)

    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const html = JSON.parse(init.body).htmlContent as string

    expect(html).toContain('Ana Anić')
    expect(html).toContain('2 adult')
    expect(html).toContain('1 child')
    expect(html).toContain('€50.00')
    expect(html).toContain('2026-07-15')
    expect(html).toContain('21:00')
    expect(html).toContain('Summer Cinema')
    // refund policy
    expect(html).toMatch(/non-refundable.*100% refundable.*cancelled/i)
  })

  it('Croatian locale renders subject, body and venue label in Croatian', async () => {
    const deps = makeDeps()
    await sendTicketEmail(makeInput({ locale: 'hr' }), deps)

    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)

    expect(body.subject).toMatch(/Vaše ulaznice za moreš?ku/i)
    expect(body.htmlContent).toContain('Ljetno kino')
    expect(body.htmlContent).toContain('odrasl') // odrasli/odraslih
    expect(body.htmlContent).toContain('djec') // djeca/djece
    // Croatian refund policy text — explicit organiser-cancel guarantee
    expect(body.htmlContent).toMatch(/nije moguć|otkaže/i)
  })

  it('resolves (does not throw) when Brevo returns an error response', async () => {
    const deps = makeDeps({
      fetch: vi
        .fn()
        .mockResolvedValue(new Response('{"message":"invalid"}', { status: 400 })),
    })
    await expect(sendTicketEmail(makeInput(), deps)).resolves.toBeUndefined()
  })

  it('resolves (does not throw) when fetch itself rejects', async () => {
    const deps = makeDeps({
      fetch: vi.fn().mockRejectedValue(new Error('network down')),
    })
    await expect(sendTicketEmail(makeInput(), deps)).resolves.toBeUndefined()
  })
})
