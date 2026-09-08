import { describe, expect, it, vi } from 'vitest'
import { handleAppLogin, handleAppLogout, identifierField } from './login'
import { APP_STRINGS } from './strings'

const cookie = (token: string) => `payload-token=${token}; Path=/; HttpOnly; SameSite=Lax`
const expiredCookie = () => 'payload-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'

const okLogin = (token = 'jwt.abc.123') => vi.fn().mockResolvedValue({ token })

// A request the browser made from our own origin: no Origin header on a
// same-origin POST is normal, JSON body, no cross-site hint.
const sameOrigin = {
  origin: null,
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

describe('identifierField', () => {
  it.each([
    ['cici@example.com', 'email'],
    ['CICI@EXAMPLE.COM', 'email'],
    // The door login, a partner POS and a dancer's slug have no @.
    ['tehnika', 'username'],
    ['cici', 'username'],
    ['admin', 'username'],
  ] as const)('%s → %s', (identifier, expected) => {
    expect(identifierField(identifier)).toBe(expected)
  })
})

describe('handleAppLogin', () => {
  it('signs in with an email and returns the session cookie', async () => {
    const login = okLogin()
    const result = await handleAppLogin(
      { identifier: 'cici@example.com', password: 'tajna' },
      { login, cookie, request: sameOrigin },
    )
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true })
    expect(result.setCookie).toBe(cookie('jwt.abc.123'))
    expect(login).toHaveBeenCalledWith({ email: 'cici@example.com', password: 'tajna' })
  })

  it('signs in with a username (ADR-0011 hybrid login)', async () => {
    const login = okLogin()
    await handleAppLogin({ identifier: 'cici', password: 'tajna' }, { login, cookie, request: sameOrigin })
    expect(login).toHaveBeenCalledWith({ username: 'cici', password: 'tajna' })
  })

  it('trims the identifier but never the password', async () => {
    const login = okLogin()
    await handleAppLogin({ identifier: '  cici  ', password: ' tajna ' }, { login, cookie, request: sameOrigin })
    expect(login).toHaveBeenCalledWith({ username: 'cici', password: ' tajna ' })
  })

  it.each([
    ['no body at all', null],
    ['an empty body', {}],
    ['no password', { identifier: 'cici' }],
    ['a blank password', { identifier: 'cici', password: '' }],
    ['no identifier', { password: 'tajna' }],
    ['a whitespace identifier', { identifier: '   ', password: 'tajna' }],
    ['a non-string identifier', { identifier: 42, password: 'tajna' }],
  ])('400s on %s, without calling Payload', async (_label, input) => {
    const login = okLogin()
    const result = await handleAppLogin(input, { login, cookie, request: sameOrigin })
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.login.missingFields })
    expect(result.setCookie).toBeUndefined()
    expect(login).not.toHaveBeenCalled()
  })

  it('401s when Payload rejects the credentials', async () => {
    const login = vi.fn().mockRejectedValue(new Error('The email or password provided is incorrect.'))
    const result = await handleAppLogin(
      { identifier: 'cici', password: 'krivo' },
      { login, cookie, request: sameOrigin },
    )
    expect(result.status).toBe(401)
    expect(result.body).toEqual({ error: APP_STRINGS.login.failed })
    expect(result.setCookie).toBeUndefined()
  })

  it('401s when Payload answers without a token', async () => {
    const login = vi.fn().mockResolvedValue({ user: { id: 1 } })
    const result = await handleAppLogin({ identifier: 'cici', password: 'x' }, { login, cookie, request: sameOrigin })
    expect(result.status).toBe(401)
  })

  it('never says WHICH half was wrong (no account enumeration)', async () => {
    const login = vi.fn().mockRejectedValue(new Error('No user with that email'))
    const result = await handleAppLogin({ identifier: 'nitko@x.hr', password: 'x' }, { login, cookie, request: sameOrigin })
    const message = 'error' in result.body ? result.body.error : ''
    expect(message).not.toMatch(/nitko@x\.hr|korisnik ne postoji|lozinka je/i)
    expect(message).toBe(APP_STRINGS.login.failed)
  })

  // Login checks credentials, never permissions: a door account signs in fine
  // and is then refused by the /app access decision with a page that explains
  // itself, rather than by a 401 that looks like a typo (#419, story 37).
  it('signs in an account that will be denied by the access decision', async () => {
    const login = okLogin('door.jwt')
    const result = await handleAppLogin(
      { identifier: 'tehnika', password: 'tajna' },
      { login, cookie, request: sameOrigin },
    )
    expect(result.status).toBe(200)
    expect(result.setCookie).toBe(cookie('door.jwt'))
  })
})

describe('handleAppLogout', () => {
  it('invalidates the session, then clears the shared cookie', async () => {
    const invalidateSession = vi.fn().mockResolvedValue(undefined)
    await expect(
      handleAppLogout({ expiredCookie, invalidateSession, request: sameOrigin }),
    ).resolves.toEqual({
      status: 200,
      body: { ok: true },
      setCookie: expiredCookie(),
    })
    expect(invalidateSession).toHaveBeenCalledOnce()
  })

  // Clearing the cookie without dropping the session row would leave the JWT
  // valid for its full 30 days: a copy taken before "Odjava" keeps working.
  it('still 200s and still expires the cookie when there is no session to drop', async () => {
    const invalidateSession = vi.fn().mockRejectedValue(new Error('No User'))
    const result = await handleAppLogout({
      expiredCookie,
      invalidateSession,
      request: sameOrigin,
    })
    expect(result.status).toBe(200)
    expect(result.setCookie).toBe(expiredCookie())
  })

  it('refuses a cross-site sign-out without touching the session', async () => {
    const invalidateSession = vi.fn()
    const result = await handleAppLogout({
      expiredCookie,
      invalidateSession,
      request: { ...sameOrigin, secFetchSite: 'cross-site' },
    })
    expect(result.status).toBe(403)
    expect(result.setCookie).toBeUndefined()
    expect(invalidateSession).not.toHaveBeenCalled()
  })
})

// The cross-site rules themselves live in request-guard.test.ts; these two
// assert the handlers actually run them, before any credential work.
describe('handleAppLogin cross-site refusal', () => {
  it.each([
    ['a cross-site fetch', { secFetchSite: 'cross-site' }],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['a form post (not JSON)', { contentType: 'application/x-www-form-urlencoded' }],
  ] as const)('refuses %s without calling Payload', async (_label, override) => {
    const login = okLogin()
    const result = await handleAppLogin(
      { identifier: 'cici', password: 'tajna' },
      { login, cookie, request: { ...sameOrigin, ...override } },
    )
    expect(result.status).not.toBe(200)
    expect(result.setCookie).toBeUndefined()
    expect(login).not.toHaveBeenCalled()
  })
})
