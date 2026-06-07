import { describe, it, expect, vi } from 'vitest'
import { sendTicketEmail, type SendTicketEmailDeps } from './send-ticket-email'

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: '1247',
    buyer: { name: 'Ana Anić', email: 'ana@example.com' },
    show: {
      date: '2026-07-15',
      time: '21:00',
      venue: 'ljetno-kino' as const,
    },
    order: { adultCount: 2, childCount: 1, total: 5000 },
    tickets: [
      { token: 'tok_1', type: 'adult' as const, ref: 'AB23-1' },
      { token: 'tok_2', type: 'adult' as const, ref: 'AB23-2' },
      { token: 'tok_3', type: 'child' as const, ref: 'AB23-3' },
    ],
    orderCode: 'AB23',
    locale: 'en' as const,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<SendTicketEmailDeps> = {}): SendTicketEmailDeps {
  return {
    fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 201 })),
    generateQrPng: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    brevoApiKey: 'test-key',
    renderTicketsPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.3 fake-pdf-bytes')),
    renderTicketEmail: vi.fn().mockResolvedValue({
      html: '<html><body>Hi Ana, Summer Cinema 2026-07-15 21:00 €50.00 adult child</body></html>',
      subject: 'Your Moreška tickets - Wednesday, 15 July 2026',
    }),
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

  it('sends from tickets@moreska.eu with Reply-To info@ to the buyer with the rendered subject', async () => {
    const deps = makeDeps()
    await sendTicketEmail(makeInput(), deps)

    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.sender.email).toBe('tickets@moreska.eu')
    expect(body.replyTo.email).toBe('info@moreska.eu')
    expect(body.to).toEqual([{ email: 'ana@example.com', name: 'Ana Anić' }])
    expect(body.subject).toMatch(/Moreška/)
  })

  it('attaches a PDF (from renderTicketsPdf) and an ICS calendar invite', async () => {
    const deps = makeDeps()
    await sendTicketEmail(makeInput(), deps)

    expect(deps.renderTicketsPdf).toHaveBeenCalledTimes(1)
    const pdfCallArgs = (deps.renderTicketsPdf as ReturnType<typeof vi.fn>).mock.calls[0]
    // The full per-person ticket list + the order code reach the renderer.
    expect(pdfCallArgs[0].tickets).toHaveLength(3)
    expect(pdfCallArgs[0].tickets.map((t: { ref: string }) => t.ref)).toEqual(['AB23-1', 'AB23-2', 'AB23-3'])
    expect(pdfCallArgs[0].orderRef).toBe('AB23')
    expect(pdfCallArgs[0].locale).toBe('en')

    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.attachment).toHaveLength(2)

    // 1. The ticket PDF
    expect(body.attachment[0].name).toBe('moreska-tickets-2026-07-15.pdf')
    expect(Buffer.from(body.attachment[0].content, 'base64').toString()).toBe(
      '%PDF-1.3 fake-pdf-bytes',
    )

    // 2. The calendar invite (.ics)
    expect(body.attachment[1].name).toBe('moreska-2026-07-15.ics')
    expect(Buffer.from(body.attachment[1].content, 'base64').toString()).toContain(
      'BEGIN:VCALENDAR',
    )
  })

  it('passes the rendered HTML through to Brevo verbatim', async () => {
    const deps = makeDeps()
    await sendTicketEmail(makeInput(), deps)

    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.htmlContent).toContain('Summer Cinema')
    expect(body.htmlContent).toContain('Ana')
  })

  it('localizes the email to the buyer but forces the PDF to English; PDF uses the order code, email uses the order id', async () => {
    const deps = makeDeps()
    await sendTicketEmail(makeInput({ locale: 'hr', orderId: '9001', orderCode: 'CD45' }), deps)

    const emailCall = (deps.renderTicketEmail as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(emailCall.locale).toBe('hr')
    expect(emailCall.orderRef).toBe('9001')

    // The printed ticket PDF is always English regardless of the buyer's locale.
    const pdfCall = (deps.renderTicketsPdf as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(pdfCall.locale).toBe('en')
    expect(pdfCall.orderRef).toBe('CD45')
  })

  it('returns true when Brevo accepts the send', async () => {
    const deps = makeDeps()
    await expect(sendTicketEmail(makeInput(), deps)).resolves.toBe(true)
  })

  it('returns false (does not throw) when Brevo returns an error response', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps({
      fetch: vi
        .fn()
        .mockResolvedValue(new Response('{"message":"invalid"}', { status: 400 })),
    })
    await expect(sendTicketEmail(makeInput(), deps)).resolves.toBe(false)
    errSpy.mockRestore()
  })

  it('returns false on a 401 (bad/missing Brevo key) — the silent-failure case', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps({
      fetch: vi.fn().mockResolvedValue(new Response('{"code":"unauthorized"}', { status: 401 })),
    })
    await expect(sendTicketEmail(makeInput(), deps)).resolves.toBe(false)
    errSpy.mockRestore()
  })

  it('returns false (does not throw) when fetch itself rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps({
      fetch: vi.fn().mockRejectedValue(new Error('network down')),
    })
    await expect(sendTicketEmail(makeInput(), deps)).resolves.toBe(false)
    errSpy.mockRestore()
  })

  it('returns false (does not throw) when PDF rendering throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps({
      renderTicketsPdf: vi.fn().mockRejectedValue(new Error('font load failed')),
    })
    await expect(sendTicketEmail(makeInput(), deps)).resolves.toBe(false)
    expect(deps.fetch).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('failure logs include orderId, buyer email and order code for manual recovery', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps({
      fetch: vi.fn().mockResolvedValue(new Response('boom', { status: 503 })),
    })
    await sendTicketEmail(makeInput({ orderId: 'order_99', orderCode: 'ZZ99' }), deps)
    const logged = errSpy.mock.calls.flat().join(' ')
    expect(logged).toContain('orderId=order_99')
    expect(logged).toContain('email=ana@example.com')
    expect(logged).toContain('code=ZZ99')
    expect(logged).toContain('status=503')
    errSpy.mockRestore()
  })
})
