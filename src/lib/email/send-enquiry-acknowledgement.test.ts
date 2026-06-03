import { describe, it, expect, vi } from 'vitest'
import { sendEnquiryAcknowledgement } from './send-enquiry-acknowledgement'
import { BREVO_EMAIL_ENDPOINT } from './post-brevo-email'

const ok = () => new Response('{}', { status: 201 })

function lastBody(fetch: ReturnType<typeof vi.fn>) {
  const init = fetch.mock.calls[0][1] as RequestInit
  return JSON.parse(init.body as string)
}

describe('sendEnquiryAcknowledgement', () => {
  it('mails the enquirer from the verified sender with Reply-To info@moreska.eu', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())
    await sendEnquiryAcknowledgement(
      { name: 'Ana Horvat', email: 'ana@example.com', locale: 'en' },
      { fetch, brevoApiKey: 'k', devEmailOverride: null },
    )

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][0]).toBe(BREVO_EMAIL_ENDPOINT)
    const body = lastBody(fetch)
    expect(body.sender.email).toBe('tickets@moreska.eu')
    expect(body.replyTo).toEqual({ email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' })
    expect(body.to).toEqual([{ email: 'ana@example.com', name: 'Ana Horvat' }])
  })

  it('renders English copy for the en locale', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())
    await sendEnquiryAcknowledgement(
      { name: 'Ana', email: 'ana@example.com', locale: 'en' },
      { fetch, brevoApiKey: 'k', devEmailOverride: null },
    )
    const body = lastBody(fetch)
    expect(body.subject).toMatch(/received your message/i)
    expect(body.htmlContent).toContain('Ana')
    expect(body.htmlContent).toMatch(/Moreška/)
  })

  it('renders Croatian copy for the hr locale', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())
    await sendEnquiryAcknowledgement(
      { name: 'Ana', email: 'ana@example.com', locale: 'hr' },
      { fetch, brevoApiKey: 'k', devEmailOverride: null },
    )
    const body = lastBody(fetch)
    expect(body.subject).toMatch(/primili/i)
    expect(body.htmlContent).toMatch(/Poštovani/)
  })

  it('defaults to English when no locale is given', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())
    await sendEnquiryAcknowledgement(
      { name: 'Ana', email: 'ana@example.com' },
      { fetch, brevoApiKey: 'k', devEmailOverride: null },
    )
    const body = lastBody(fetch)
    expect(body.subject).toMatch(/received your message/i)
  })

  it('has no em-dashes in user-facing copy', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())
    for (const locale of ['en', 'hr'] as const) {
      fetch.mockClear()
      await sendEnquiryAcknowledgement(
        { name: 'Ana', email: 'ana@example.com', locale },
        { fetch, brevoApiKey: 'k', devEmailOverride: null },
      )
      const body = lastBody(fetch)
      expect(body.subject).not.toContain('—')
      expect(body.htmlContent).not.toContain('—')
    }
  })

  it('HTML-escapes the enquirer name to avoid injection', async () => {
    const fetch = vi.fn().mockResolvedValue(ok())
    await sendEnquiryAcknowledgement(
      { name: '<script>x</script>', email: 'ana@example.com', locale: 'en' },
      { fetch, brevoApiKey: 'k', devEmailOverride: null },
    )
    const body = lastBody(fetch)
    expect(body.htmlContent).not.toContain('<script>')
    expect(body.htmlContent).toContain('&lt;script&gt;')
  })

  it('throws on a Brevo non-ok response so the caller can swallow it', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('bad key', { status: 401 }))
    await expect(
      sendEnquiryAcknowledgement(
        { name: 'Ana', email: 'ana@example.com', locale: 'en' },
        { fetch, brevoApiKey: 'k', devEmailOverride: null },
      ),
    ).rejects.toThrow(/401/)
  })
})
