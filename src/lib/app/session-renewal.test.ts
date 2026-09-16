import { describe, expect, it } from 'vitest'
import {
  SESSION_RENEW_AFTER_MS,
  appSessionCookieName,
  decideSessionRenewal,
  readTokenIssuedAt,
  sessionTokenFromCookieHeader,
  shouldRenewSession,
} from './session-renewal'

// The age rule, with no database and no Payload (#650).

const NOW = new Date('2026-09-16T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms)
}

/** A JWT-shaped string whose payload segment carries these claims. */
function tokenWith(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `eyJhbGciOiJIUzI1NiJ9.${body}.c2lnbmF0dXJl`
}

describe('shouldRenewSession', () => {
  const cases: Array<[string, Date | number | null | undefined, boolean]> = [
    ['signed in a minute ago', ago(60_000), false],
    ['signed in yesterday', ago(DAY), false],
    ['six days old', ago(6 * DAY), false],
    ['exactly seven days old', ago(SESSION_RENEW_AFTER_MS), false],
    ['a millisecond past seven days', ago(SESSION_RENEW_AFTER_MS + 1), true],
    ['eight days old', ago(8 * DAY), true],
    // A dancer who opens the app weekly is renewed before the thirty days run
    // out; one who has been away thirty-one days has no cookie left to renew,
    // so this row is about the twenty-nine-day-old cookie that still works.
    ['twenty-nine days old', ago(29 * DAY), true],
    ['issued in the future (clock skew)', new Date(NOW.getTime() + DAY), false],
    ['no issue time at all', null, false],
    ['undefined issue time', undefined, false],
    ['an unparseable date', new Date('nonsense'), false],
    ['a NaN timestamp', Number.NaN, false],
  ]

  it.each(cases)('%s → %s', (_label, issuedAt, expected) => {
    expect(shouldRenewSession(issuedAt, NOW)).toBe(expected)
  })

  it('accepts plain millisecond timestamps on both sides', () => {
    expect(shouldRenewSession(NOW.getTime() - 8 * DAY, NOW.getTime())).toBe(true)
    expect(shouldRenewSession(NOW.getTime() - DAY, NOW.getTime())).toBe(false)
  })

  it('refuses when "now" itself is unreadable', () => {
    expect(shouldRenewSession(ago(30 * DAY), new Date('nonsense'))).toBe(false)
  })
})

describe('appSessionCookieName', () => {
  it.each([
    ['payload', 'payload-token'],
    ['cecilija', 'cecilija-token'],
    ['', 'payload-token'],
    [null, 'payload-token'],
    [undefined, 'payload-token'],
  ])('%s → %s', (prefix, expected) => {
    expect(appSessionCookieName(prefix)).toBe(expected)
  })
})

describe('sessionTokenFromCookieHeader', () => {
  it.each<[string, string | null | undefined, string | null]>([
    ['the only cookie', 'payload-token=abc', 'abc'],
    ['among others', 'moreska_locale=hr; payload-token=abc; foo=bar', 'abc'],
    ['with spaces', ' payload-token = abc ', 'abc'],
    ['a different prefix is not ours', 'other-token=abc', null],
    ['an empty value', 'payload-token=', null],
    ['no cookies at all', '', null],
    ['no header', null, null],
    ['a valueless flag', 'payload-token', null],
  ])('%s', (_label, header, expected) => {
    expect(sessionTokenFromCookieHeader(header, 'payload')).toBe(expected)
  })

  it('does not match a cookie whose name merely ends in ours', () => {
    expect(sessionTokenFromCookieHeader('xpayload-token=abc', 'payload')).toBe(null)
  })
})

describe('readTokenIssuedAt', () => {
  it('reads iat as seconds since the epoch', () => {
    const iat = Math.floor(NOW.getTime() / 1000)
    expect(readTokenIssuedAt(tokenWith({ id: 3, iat, exp: iat + 100 }))?.toISOString()).toBe(
      NOW.toISOString(),
    )
  })

  it.each<[string, string | null | undefined]>([
    ['no token', null],
    ['an empty string', ''],
    ['not three segments', 'abc.def'],
    ['a payload that is not base64', 'a.!!!!.c'],
    ['a payload that is not JSON', `a.${Buffer.from('nope').toString('base64url')}.c`],
    ['claims without iat', tokenWith({ id: 3 })],
    ['an iat that is not a number', tokenWith({ iat: '1758024000' })],
  ])('%s → null', (_label, token) => {
    expect(readTokenIssuedAt(token)).toBe(null)
  })
})

describe('decideSessionRenewal', () => {
  const stale = tokenWith({ iat: Math.floor(ago(8 * DAY).getTime() / 1000) })
  const fresh = tokenWith({ iat: Math.floor(ago(DAY).getTime() / 1000) })

  it('renews a stale cookie', () => {
    expect(
      decideSessionRenewal({
        cookieHeader: `payload-token=${stale}`,
        cookiePrefix: 'payload',
        now: NOW,
      }),
    ).toBe(true)
  })

  it('leaves a fresh cookie alone', () => {
    expect(
      decideSessionRenewal({
        cookieHeader: `payload-token=${fresh}`,
        cookiePrefix: 'payload',
        now: NOW,
      }),
    ).toBe(false)
  })

  it('renews nothing when there is no session cookie', () => {
    expect(
      decideSessionRenewal({ cookieHeader: 'moreska_locale=hr', cookiePrefix: 'payload', now: NOW }),
    ).toBe(false)
    expect(decideSessionRenewal({ cookieHeader: null, cookiePrefix: 'payload', now: NOW })).toBe(
      false,
    )
  })
})
