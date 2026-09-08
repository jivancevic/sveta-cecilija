import { describe, expect, it } from 'vitest'
import { appRequestMeta, originOf, rejectAppRequest } from './request-guard'

const OURS = ['https://moreska.eu', 'http://localhost:3000']
const base = {
  origin: null as string | null,
  secFetchSite: null as string | null,
  contentType: 'application/json',
  allowedOrigins: OURS,
}

describe('originOf', () => {
  it.each([
    ['https://moreska.eu/app/login', 'https://moreska.eu'],
    ['http://localhost:3000/api/app/login', 'http://localhost:3000'],
    ['not a url', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%s → %s', (input, expected) => {
    expect(originOf(input)).toBe(expected)
  })
})

describe('rejectAppRequest', () => {
  it.each([
    // label, overrides, expected status (null = allowed)
    ['a same-origin fetch with no Origin header', {}, null],
    ['a same-origin fetch that sends our Origin', { origin: 'https://moreska.eu' }, null],
    ['the dev origin', { origin: 'http://localhost:3000' }, null],
    ['an Origin with a path attached', { origin: 'https://moreska.eu/app' }, null],
    ['Sec-Fetch-Site: same-origin', { secFetchSite: 'same-origin' }, null],
    ['Sec-Fetch-Site: none (typed in the address bar)', { secFetchSite: 'none' }, null],
    ['a JSON content type with a charset', { contentType: 'application/json; charset=utf-8' }, null],
    // curl and server-to-server: neither header, still fine.
    ['no browser headers at all', { origin: null, secFetchSite: null }, null],

    ['a cross-site POST', { secFetchSite: 'cross-site' }, 403],
    ['a cross-site POST in odd casing', { secFetchSite: 'Cross-Site' }, 403],
    ["someone else's Origin", { origin: 'https://evil.example' }, 403],
    ['a look-alike host', { origin: 'https://moreska.eu.evil.example' }, 403],
    ['http where we serve https', { origin: 'http://moreska.eu' }, 403],
    ['a garbage Origin header', { origin: 'null' }, 403],
    // Cross-site wins over the content type: it is the more specific refusal.
    ['a cross-site form post', { secFetchSite: 'cross-site', contentType: 'text/plain' }, 403],

    ['an HTML form post', { contentType: 'application/x-www-form-urlencoded' }, 415],
    ['a text/plain post (the CSRF-friendly type)', { contentType: 'text/plain' }, 415],
    ['a POST with no content type', { contentType: null }, 415],
  ] as const)('%s', (_label, overrides, expected) => {
    const result = rejectAppRequest({ ...base, ...overrides })
    expect(result?.status ?? null).toBe(expected)
  })
})

describe('appRequestMeta', () => {
  const req = (headers: Record<string, string>) =>
    new Request('https://moreska.eu/api/app/login', { method: 'POST', headers })

  it('reads the three headers and owns both the configured and the served origin', () => {
    const meta = appRequestMeta(
      req({
        origin: 'https://moreska.eu',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
      }),
      'https://moreska.eu',
    )
    expect(meta.origin).toBe('https://moreska.eu')
    expect(meta.secFetchSite).toBe('same-origin')
    expect(meta.contentType).toBe('application/json')
    expect(meta.allowedOrigins).toEqual(['https://moreska.eu'])
  })

  it('keeps the request origin when NEXT_PUBLIC_BASE_URL is missing or junk', () => {
    expect(appRequestMeta(req({}), undefined).allowedOrigins).toEqual(['https://moreska.eu'])
    expect(appRequestMeta(req({}), 'not a url').allowedOrigins).toEqual(['https://moreska.eu'])
  })

  it('allows both origins when the deployment is reached under two names', () => {
    const meta = appRequestMeta(req({ origin: 'http://localhost:3426' }), 'http://localhost:3426')
    expect(rejectAppRequest({ ...meta, contentType: 'application/json' })).toBeNull()
  })
})
