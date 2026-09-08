import { describe, expect, it, vi } from 'vitest'
import {
  MORESKANT_EMAIL_SUBJECTS,
  renderMoreskantEmailHtml,
  sendMoreskantEmail,
} from './send-moreskant-email'
import { BREVO_EMAIL_ENDPOINT } from './post-brevo-email'

const link = 'https://moreska.eu/app/set-password?token=tok-abc'

function fakeFetch(status = 201) {
  return vi.fn(async () => new Response('', { status })) as unknown as typeof fetch
}

function bodyOf(fetchMock: ReturnType<typeof fakeFetch>) {
  const call = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!
  return JSON.parse(String(call[1].body))
}

describe('renderMoreskantEmailHtml', () => {
  it('greets by nickname and carries the link', () => {
    const html = renderMoreskantEmailHtml({ kind: 'invite', to: 'a@b.c', greeting: 'Cici', link })
    expect(html).toContain('Bok Cici,')
    expect(html).toContain(link)
    expect(html).toContain('vrijedi 7 dana')
  })

  it('drops the name when there is none', () => {
    const html = renderMoreskantEmailHtml({ kind: 'reset', to: 'a@b.c', greeting: '', link })
    expect(html).toContain('Bok,')
    expect(html).toContain('vrijedi 1 sat')
  })

  it('centres with align and fixed-pixel cells, never width:100%', () => {
    const html = renderMoreskantEmailHtml({ kind: 'invite', to: 'a@b.c', greeting: 'Cici', link })
    expect(html).toContain('align="center"')
    expect(html).toContain('width="560"')
    expect(html).not.toContain('width:100%')
  })

  it('escapes a nickname that carries markup', () => {
    const html = renderMoreskantEmailHtml({
      kind: 'invite',
      to: 'a@b.c',
      greeting: '<b>Cici</b>',
      link,
    })
    expect(html).toContain('&lt;b&gt;Cici&lt;/b&gt;')
  })

  it('says moreškant, never moreškar, and carries no em-dash', () => {
    for (const kind of ['invite', 'reset'] as const) {
      const html = renderMoreskantEmailHtml({ kind, to: 'a@b.c', greeting: 'Cici', link })
      expect(html).not.toMatch(/moreškar/i)
      expect(html).not.toContain('—')
    }
  })
})

describe('sendMoreskantEmail', () => {
  it('posts the invitation from info@moreska.eu with the right subject', async () => {
    const fetch = fakeFetch()
    await sendMoreskantEmail(
      { kind: 'invite', to: 'cici@example.com', greeting: 'Cici', link },
      { fetch, brevoApiKey: 'key' },
    )
    const [url] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!
    expect(url).toBe(BREVO_EMAIL_ENDPOINT)
    const body = bodyOf(fetch)
    expect(body.sender).toEqual({ email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' })
    expect(body.to).toEqual([{ email: 'cici@example.com', name: 'Cici' }])
    expect(body.subject).toBe('Pozivnica za Moreškant')
    expect(body.htmlContent).toContain(link)
  })

  it('posts the reset mail with its own subject', async () => {
    const fetch = fakeFetch()
    await sendMoreskantEmail(
      { kind: 'reset', to: 'cici@example.com', greeting: '', link },
      { fetch, brevoApiKey: 'key' },
    )
    expect(bodyOf(fetch).subject).toBe(MORESKANT_EMAIL_SUBJECTS.reset)
  })

  it('logs but never throws when Brevo refuses', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      sendMoreskantEmail(
        { kind: 'invite', to: 'cici@example.com', greeting: 'Cici', link },
        { fetch: fakeFetch(400), brevoApiKey: 'key' },
      ),
    ).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
