import { describe, it, expect, vi } from 'vitest'
import {
  applyDevEmailOverride,
  postBrevoEmail,
  BREVO_EMAIL_ENDPOINT,
  type BrevoEmailBody,
} from './post-brevo-email'

function makeBody(overrides: Partial<BrevoEmailBody> = {}): BrevoEmailBody {
  return {
    sender: { email: 'tickets@moreska.eu', name: 'HGD Sveta Cecilija' },
    to: [{ email: 'ana@example.com', name: 'Ana Anić' }],
    subject: 'Your Moreška tickets',
    htmlContent: '<p>hi</p>',
    ...overrides,
  }
}

describe('applyDevEmailOverride', () => {
  it('is a no-op when override is unset (undefined)', () => {
    const body = makeBody()
    const out = applyDevEmailOverride(body, undefined)
    expect(out).toBe(body) // same reference — byte-for-byte unchanged
  })

  it('is a no-op when override is empty / whitespace', () => {
    expect(applyDevEmailOverride(makeBody(), '')).toEqual(makeBody())
    expect(applyDevEmailOverride(makeBody(), '   ')).toEqual(makeBody())
    expect(applyDevEmailOverride(makeBody(), null)).toEqual(makeBody())
  })

  it('rewrites a single recipient and prefixes the subject with the original', () => {
    const out = applyDevEmailOverride(makeBody(), 'dev@inbox.test')
    expect(out.to).toEqual([{ email: 'dev@inbox.test', name: 'Ana Anić' }])
    expect(out.subject).toBe('[DEV → ana@example.com] Your Moreška tickets')
  })

  it('preserves non-recipient fields untouched (sender, html, attachments)', () => {
    const out = applyDevEmailOverride(
      makeBody({ attachment: [{ name: 'x.pdf', content: 'abc' }] }),
      'dev@inbox.test',
    )
    expect(out.sender).toEqual({ email: 'tickets@moreska.eu', name: 'HGD Sveta Cecilija' })
    expect(out.htmlContent).toBe('<p>hi</p>')
    expect(out.attachment).toEqual([{ name: 'x.pdf', content: 'abc' }])
  })

  it('rewrites all recipients and lists every original in the subject', () => {
    const out = applyDevEmailOverride(
      makeBody({
        to: [
          { email: 'ana@example.com', name: 'Ana' },
          { email: 'marko@example.com', name: 'Marko' },
        ],
      }),
      'dev@inbox.test',
    )
    expect(out.to).toEqual([
      { email: 'dev@inbox.test', name: 'Ana' },
      { email: 'dev@inbox.test', name: 'Marko' },
    ])
    expect(out.subject).toBe('[DEV → ana@example.com, marko@example.com] Your Moreška tickets')
  })

  it('drops cc and bcc so no copy leaks, and lists them in the subject tag', () => {
    const out = applyDevEmailOverride(
      makeBody({
        cc: [{ email: 'cc@example.com' }],
        bcc: [{ email: 'bcc@example.com' }],
      }),
      'dev@inbox.test',
    )
    expect(out.cc).toBeUndefined()
    expect(out.bcc).toBeUndefined()
    expect(out.to).toEqual([{ email: 'dev@inbox.test', name: 'Ana Anić' }])
    expect(out.subject).toBe(
      '[DEV → ana@example.com, cc@example.com, bcc@example.com] Your Moreška tickets',
    )
  })

  it('is idempotent — does not double-prefix an already-tagged subject', () => {
    const once = applyDevEmailOverride(makeBody(), 'dev@inbox.test')
    const twice = applyDevEmailOverride(once, 'dev@inbox.test')
    expect(twice.subject).toBe('[DEV → ana@example.com] Your Moreška tickets')
  })

  it('de-dupes repeated addresses in the subject tag', () => {
    const out = applyDevEmailOverride(
      makeBody({
        to: [
          { email: 'ana@example.com', name: 'Ana' },
          { email: 'ana@example.com', name: 'Ana (again)' },
        ],
      }),
      'dev@inbox.test',
    )
    expect(out.subject).toBe('[DEV → ana@example.com] Your Moreška tickets')
  })
})

describe('postBrevoEmail', () => {
  function makeFetch() {
    return vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
  }

  it('POSTs the body to the Brevo endpoint with the api-key header', async () => {
    const fetch = makeFetch()
    await postBrevoEmail(makeBody(), { fetch, brevoApiKey: 'k', devEmailOverride: null })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(BREVO_EMAIL_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers['api-key']).toBe('k')
    expect(init.headers['content-type']).toBe('application/json')
  })

  it('sends the unchanged body when override is explicitly null', async () => {
    const fetch = makeFetch()
    await postBrevoEmail(makeBody(), { fetch, brevoApiKey: 'k', devEmailOverride: null })
    const sent = JSON.parse(fetch.mock.calls[0][1].body)
    expect(sent.to).toEqual([{ email: 'ana@example.com', name: 'Ana Anić' }])
    expect(sent.subject).toBe('Your Moreška tickets')
  })

  it('applies the override when one is injected', async () => {
    const fetch = makeFetch()
    await postBrevoEmail(makeBody(), {
      fetch,
      brevoApiKey: 'k',
      devEmailOverride: 'dev@inbox.test',
    })
    const sent = JSON.parse(fetch.mock.calls[0][1].body)
    expect(sent.to).toEqual([{ email: 'dev@inbox.test', name: 'Ana Anić' }])
    expect(sent.subject).toBe('[DEV → ana@example.com] Your Moreška tickets')
  })

  it('reads process.env.DEV_EMAIL_OVERRIDE when no override is injected', async () => {
    const fetch = makeFetch()
    const prev = process.env.DEV_EMAIL_OVERRIDE
    process.env.DEV_EMAIL_OVERRIDE = 'env@inbox.test'
    try {
      await postBrevoEmail(makeBody(), { fetch, brevoApiKey: 'k' })
    } finally {
      if (prev === undefined) delete process.env.DEV_EMAIL_OVERRIDE
      else process.env.DEV_EMAIL_OVERRIDE = prev
    }
    const sent = JSON.parse(fetch.mock.calls[0][1].body)
    expect(sent.to).toEqual([{ email: 'env@inbox.test', name: 'Ana Anić' }])
    expect(sent.subject).toBe('[DEV → ana@example.com] Your Moreška tickets')
  })
})
