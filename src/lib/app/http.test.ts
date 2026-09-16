import { describe, expect, it } from 'vitest'
import { cookieValue, firstHeaderValue, requestIsHttps, toMillis } from './http'

// The three request details `/app` reads, each of which had grown its own copy
// in every file that wanted it. One table each; no browser, no server.

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers })
}

describe('requestIsHttps', () => {
  it('believes the proxy over the URL, which is the whole point behind Traefik', () => {
    // The standalone server sees `http://0.0.0.0:3000` on a request the browser
    // made over https, so trusting `req.url` would drop `Secure` in production.
    expect(requestIsHttps(req('http://0.0.0.0:3000/x', { 'x-forwarded-proto': 'https' }))).toBe(
      true,
    )
    expect(requestIsHttps(req('https://moreska.eu/x', { 'x-forwarded-proto': 'http' }))).toBe(false)
  })

  it('reads only the first hop of a folded header, and ignores its case', () => {
    expect(requestIsHttps(req('http://x/y', { 'x-forwarded-proto': 'HTTPS, http' }))).toBe(true)
    expect(requestIsHttps(req('http://x/y', { 'x-forwarded-proto': 'http, https' }))).toBe(false)
  })

  it('falls back to the URL when no proxy said anything', () => {
    expect(requestIsHttps(req('https://moreska.eu/x'))).toBe(true)
    // Development: a cookie the browser actually keeps on http://localhost.
    expect(requestIsHttps(req('http://localhost:3000/x'))).toBe(false)
  })
})

describe('cookieValue', () => {
  const header = 'cecilija_device=abc123; payload-token=a.b.c; moreskant_join=s%20ecret'

  it('finds a cookie among others, whitespace and all', () => {
    expect(cookieValue(header, 'cecilija_device')).toBe('abc123')
    expect(cookieValue(header, 'payload-token')).toBe('a.b.c')
  })

  it('keeps the value RAW, because the three callers disagree about decoding', () => {
    expect(cookieValue(header, 'moreskant_join')).toBe('s%20ecret')
  })

  it('splits on the first = only, so a base64 value survives', () => {
    expect(cookieValue('t=YWJj==', 't')).toBe('YWJj==')
  })

  it.each([
    ['no header', null, 'cecilija_device'],
    ['an empty header', '', 'cecilija_device'],
    ['a name that is not there', header, 'nepostojeci'],
    ['an empty value', 'cecilija_device=', 'cecilija_device'],
    ['a pair with no =', 'junk; cecilija_device', 'cecilija_device'],
  ])('is null for %s', (_label, raw, name) => {
    expect(cookieValue(raw, name)).toBeNull()
  })
})

describe('toMillis', () => {
  it.each([
    ['a Date', new Date('2026-09-16T10:00:00.000Z'), 1789552800000],
    ['a number', 17, 17],
    ['zero', 0, 0],
    ['null', null, null],
    ['undefined', undefined, null],
    ['an invalid Date', new Date('nonsense'), null],
    ['NaN', Number.NaN, null],
  ])('%s', (_label, value, expected) => {
    expect(toMillis(value)).toBe(expected)
  })
})

describe('firstHeaderValue', () => {
  it('trims the first hop and answers "" when the header is absent', () => {
    expect(firstHeaderValue(req('http://x/y', { 'x-forwarded-host': ' a.eu , b.eu' }), 'x-forwarded-host')).toBe(
      'a.eu',
    )
    expect(firstHeaderValue(req('http://x/y'), 'x-forwarded-host')).toBe('')
  })
})
