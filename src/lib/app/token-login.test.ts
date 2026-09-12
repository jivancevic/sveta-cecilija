import { describe, expect, it, vi } from 'vitest'
import { handleTokenLogin, mayOpenAppSession, type TokenLoginDeps } from './token-login'
import { APP_STRINGS } from './strings'

const sameOrigin = {
  origin: null,
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const dancer = { id: 12, permissions: ['moreskant'], shared: false }
const cookie = 'payload-token=jwt.session; Path=/; HttpOnly; SameSite=Lax'

function deps(overrides: Partial<TokenLoginDeps> = {}): TokenLoginDeps {
  return {
    request: sameOrigin,
    findUserByToken: vi.fn().mockResolvedValue(dancer),
    openSession: vi.fn().mockResolvedValue(cookie),
    ...overrides,
  }
}

describe('mayOpenAppSession', () => {
  it.each([
    [['moreskant'], true],
    [['moreska'], true],
    [['moreska', 'users', 'tickets'], true],
    [['tickets'], false],
    [['door'], false],
    [['partner'], false],
    [[], false],
  ])('%s → %s', (permissions, expected) => {
    expect(mayOpenAppSession({ id: 1, permissions })).toBe(expected)
  })

  it('is false for no user at all', () => {
    expect(mayOpenAppSession(null)).toBe(false)
  })
})

describe('handleTokenLogin — the request guard', () => {
  it.each([
    ['cross-site', { ...sameOrigin, secFetchSite: 'cross-site' }, 403],
    ['a foreign Origin', { ...sameOrigin, origin: 'https://evil.example' }, 403],
    ['a form body', { ...sameOrigin, contentType: 'text/plain' }, 415],
  ])('refuses %s before looking the token up', async (_label, request, status) => {
    const d = deps({ request })
    const result = await handleTokenLogin({ token: 'live' }, d)
    expect(result.status).toBe(status)
    expect(result.body).toEqual({ error: APP_STRINGS.signIn.unexpected })
    expect(d.findUserByToken).not.toHaveBeenCalled()
  })
})

describe('handleTokenLogin — refusals', () => {
  it.each([
    ['no body', null],
    ['no token', {}],
    ['a blank token', { token: '   ' }],
    ['a non-string token', { token: 42 }],
  ])('400s on %s without opening a session', async (_label, input) => {
    const d = deps()
    const result = await handleTokenLogin(input, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.signIn.invalidToken })
    expect(d.openSession).not.toHaveBeenCalled()
  })

  // Unknown and expired are one answer on purpose: for the person holding the
  // link they are one situation, and telling them apart would say whether a
  // token ever existed.
  it('400s on a token nothing matches', async () => {
    const d = deps({ findUserByToken: vi.fn().mockResolvedValue(null) })
    const result = await handleTokenLogin({ token: 'stale' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.signIn.invalidToken })
    expect(d.openSession).not.toHaveBeenCalled()
  })

  // A lookup that cannot answer must not read as "no such token", which sends
  // the dancer to ask for a new link that would fail the same way.
  it('500s when the lookup throws', async () => {
    const d = deps({ findUserByToken: vi.fn().mockRejectedValue(new Error('db down')) })
    const result = await handleTokenLogin({ token: 'live' }, d)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: APP_STRINGS.signIn.unexpected })
    expect(d.openSession).not.toHaveBeenCalled()
  })

  it('403s a shared login (ADR-0022)', async () => {
    const d = deps({
      findUserByToken: vi.fn().mockResolvedValue({ id: 2, permissions: ['moreskant'], shared: true }),
    })
    const result = await handleTokenLogin({ token: 'live' }, d)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: APP_STRINGS.signIn.sharedAccount })
    expect(d.openSession).not.toHaveBeenCalled()
  })

  // The `/app` door opens for `/app` accounts. A ticketing or door login resets
  // its password in `/admin`; this is not a second way into the backoffice.
  it('403s an account that has no /app', async () => {
    const d = deps({
      findUserByToken: vi.fn().mockResolvedValue({ id: 5, permissions: ['tickets'] }),
    })
    const result = await handleTokenLogin({ token: 'live' }, d)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: APP_STRINGS.signIn.notAppAccount })
    expect(d.openSession).not.toHaveBeenCalled()
  })

  it('500s when the session cannot be opened', async () => {
    const d = deps({ openSession: vi.fn().mockRejectedValue(new Error('no user')) })
    const result = await handleTokenLogin({ token: 'live' }, d)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: APP_STRINGS.signIn.unexpected })
  })
})

describe('handleTokenLogin — success', () => {
  it('opens a session for the account the token belongs to', async () => {
    const d = deps()
    const result = await handleTokenLogin({ token: '  live-token  ' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true })
    expect(result.setCookie).toBe(cookie)
    expect(d.findUserByToken).toHaveBeenCalledWith('live-token')
    expect(d.openSession).toHaveBeenCalledWith(12)
  })

  it('lets a voditelj in too', async () => {
    const d = deps({
      findUserByToken: vi.fn().mockResolvedValue({ id: 3, permissions: ['moreska', 'moreskant'] }),
    })
    const result = await handleTokenLogin({ token: 'live' }, d)
    expect(result.status).toBe(200)
    expect(d.openSession).toHaveBeenCalledWith(3)
  })

  // The token is deliberately NOT spent: an invitation arrives by SMS, and the
  // second tap (the one that re-opens the link in Safari, out of a messenger's
  // webview) is the most common way a dancer actually gets in (#455, #463).
  it('can be used twice', async () => {
    const d = deps()
    await handleTokenLogin({ token: 'live' }, d)
    const second = await handleTokenLogin({ token: 'live' }, d)
    expect(second.status).toBe(200)
    expect(d.openSession).toHaveBeenCalledTimes(2)
  })
})
