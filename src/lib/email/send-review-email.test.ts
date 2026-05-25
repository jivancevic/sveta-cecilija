import { describe, it, expect, vi } from 'vitest'
import { sendReviewEmail, type SendReviewEmailDeps } from './send-review-email'

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'order_42',
    buyer: { name: 'Ana Anić', email: 'ana@example.com' },
    locale: 'en' as const,
    tripadvisorUrl: 'https://tripadvisor.example/review',
    googleReviewUrl: 'https://google.example/review',
    ...overrides,
  }
}

function makeDeps(overrides: Partial<SendReviewEmailDeps> = {}): SendReviewEmailDeps {
  return {
    fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 201 })),
    brevoApiKey: 'test-key',
    ...overrides,
  }
}

describe('sendReviewEmail', () => {
  it('POSTs to Brevo with brand-layer sender ("Moreška by HGD Sveta Cecilija")', async () => {
    const deps = makeDeps()
    await sendReviewEmail(makeInput(), deps)
    const [url, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    const body = JSON.parse(init.body)
    expect(body.sender.email).toBe('info@moreska.eu')
    expect(body.sender.name).toMatch(/Moreška by HGD Sveta Cecilija/)
  })

  it('English subject and copy include both review CTAs', async () => {
    const deps = makeDeps()
    await sendReviewEmail(makeInput(), deps)
    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.subject).toBe('How was Moreška?')
    expect(body.htmlContent).toContain('https://tripadvisor.example/review')
    expect(body.htmlContent).toContain('https://google.example/review')
    expect(body.htmlContent).toMatch(/Review on TripAdvisor/i)
    expect(body.htmlContent).toMatch(/Review on Google/i)
    expect(body.htmlContent).toContain('Ana Anić')
  })

  it('Croatian locale renders subject and body in Croatian', async () => {
    const deps = makeDeps()
    await sendReviewEmail(makeInput({ locale: 'hr' }), deps)
    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.subject).toMatch(/Moreška/)
    expect(body.htmlContent).toMatch(/Recenzija/i)
  })

  it('defaults locale to en when omitted', async () => {
    const deps = makeDeps()
    await sendReviewEmail(makeInput({ locale: undefined }), deps)
    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.subject).toBe('How was Moreška?')
  })

  it('footer references the legal entity name (HGD Sveta Cecilija) per ADR-0003', async () => {
    const deps = makeDeps()
    await sendReviewEmail(makeInput(), deps)
    const [, init] = (deps.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.htmlContent).toMatch(/Legal entity: HGD Sveta Cecilija/)
  })

  it('resolves (does not throw) when Brevo returns an error response', async () => {
    const deps = makeDeps({
      fetch: vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendReviewEmail(makeInput(), deps)).resolves.toBeUndefined()
    errSpy.mockRestore()
  })

  it('failure log includes orderId for manual recovery', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps({
      fetch: vi.fn().mockResolvedValue(new Response('nope', { status: 503 })),
    })
    await sendReviewEmail(makeInput({ orderId: 'order_77' }), deps)
    const logged = errSpy.mock.calls.flat().join(' ')
    expect(logged).toContain('orderId=order_77')
    expect(logged).toContain('status=503')
    errSpy.mockRestore()
  })
})
