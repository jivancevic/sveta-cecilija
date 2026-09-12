import { describe, expect, it } from 'vitest'
import { clearJoinClaimCookie, JOIN_COOKIE, joinClaimCookie, joinSecretFrom } from './join-cookie'

function request(headers: Record<string, string> = {}, url = 'http://localhost:3000/api/app/join') {
  return new Request(url, { headers })
}

describe('joinClaimCookie', () => {
  it('is httpOnly, Lax and rooted at / so both halves of /app/join see it', () => {
    const cookie = joinClaimCookie('secret-abc', 7200, request())
    expect(cookie).toContain(`${JOIN_COOKIE}=secret-abc`)
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=7200')
  })

  // Development is http://localhost, where a Secure cookie is simply dropped.
  it('adds Secure only on an https request', () => {
    expect(joinClaimCookie('s', 60, request())).not.toContain('Secure')
    expect(
      joinClaimCookie('s', 60, request({ 'x-forwarded-proto': 'https' })),
    ).toContain('Secure')
    expect(joinClaimCookie('s', 60, request({}, 'https://moreska.eu/api/app/join'))).toContain(
      'Secure',
    )
  })

  it('escapes the value', () => {
    expect(joinClaimCookie('a b;c', 60, request())).toContain(`${JOIN_COOKIE}=a%20b%3Bc`)
  })
})

describe('clearJoinClaimCookie', () => {
  it('expires it immediately on the same path', () => {
    const cookie = clearJoinClaimCookie(request())
    expect(cookie).toContain(`${JOIN_COOKIE}=`)
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Path=/')
  })
})

describe('joinSecretFrom', () => {
  it('reads the claim secret out of a crowded cookie header', () => {
    const req = request({ cookie: `payload-token=jwt; ${JOIN_COOKIE}=secret-abc; other=1` })
    expect(joinSecretFrom(req)).toBe('secret-abc')
  })

  it('decodes what the setter escaped', () => {
    expect(joinSecretFrom(request({ cookie: `${JOIN_COOKIE}=a%20b` }))).toBe('a b')
  })

  it.each([
    ['no cookie header at all', {}],
    ['other cookies only', { cookie: 'payload-token=jwt' }],
    ['an empty value', { cookie: `${JOIN_COOKIE}=` }],
  ])('is null with %s', (_label, headers) => {
    expect(joinSecretFrom(request(headers))).toBeNull()
  })

  // `moreskant_onboarded` starts with the same word; a prefix match would read
  // the wrong cookie and hand the status route a secret that is not one.
  it('does not match a cookie whose name merely starts the same', () => {
    expect(joinSecretFrom(request({ cookie: 'moreskant_join_other=nope' }))).toBeNull()
  })
})
