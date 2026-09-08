import { describe, expect, it, vi } from 'vitest'
import { handleSetPassword, MIN_PASSWORD_LENGTH, type SetPasswordDeps } from './set-password'
import { APP_STRINGS } from './strings'

const sameOrigin = {
  origin: null,
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const cookie = (token: string) => `payload-token=${token}; Path=/; HttpOnly; SameSite=Lax`

function deps(overrides: Partial<SetPasswordDeps> = {}): SetPasswordDeps {
  return {
    request: sameOrigin,
    resetPassword: vi.fn().mockResolvedValue({ token: 'jwt.new.session' }),
    cookie,
    ...overrides,
  }
}

const good = { token: 'tok-abc', password: 'moreska2026', repeat: 'moreska2026' }

describe('handleSetPassword — the request guard', () => {
  it.each([
    ['cross-site', { ...sameOrigin, secFetchSite: 'cross-site' }, 403],
    ['a foreign Origin', { ...sameOrigin, origin: 'https://evil.example' }, 403],
    ['a form body', { ...sameOrigin, contentType: 'text/plain' }, 415],
  ])('refuses %s before touching Payload', async (_label, request, status) => {
    const d = deps({ request })
    const result = await handleSetPassword(good, d)
    expect(result.status).toBe(status)
    expect(result.body).toEqual({ error: APP_STRINGS.setPassword.unexpected })
    expect(d.resetPassword).not.toHaveBeenCalled()
  })
})

describe('handleSetPassword — refusals', () => {
  it.each([
    ['no body', null, APP_STRINGS.setPassword.missingToken],
    ['no token', { password: 'moreska2026', repeat: 'moreska2026' }, APP_STRINGS.setPassword.missingToken],
    ['a blank token', { ...good, token: '  ' }, APP_STRINGS.setPassword.missingToken],
    ['a short password', { ...good, password: 'kratko', repeat: 'kratko' }, APP_STRINGS.setPassword.tooShort],
    ['a mismatched repeat', { ...good, repeat: 'nesto-drugo' }, APP_STRINGS.setPassword.mismatch],
  ])('400s on %s without calling resetPassword', async (_label, input, message) => {
    const d = deps()
    const result = await handleSetPassword(input, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: message })
    expect(result.setCookie).toBeUndefined()
    expect(d.resetPassword).not.toHaveBeenCalled()
  })

  it('accepts a password of exactly the minimum length', async () => {
    const pass = 'x'.repeat(MIN_PASSWORD_LENGTH)
    const result = await handleSetPassword({ token: 't', password: pass, repeat: pass }, deps())
    expect(result.status).toBe(200)
  })

  it.each([
    ['an expired or unknown token', vi.fn().mockRejectedValue(new Error('Token is either invalid or has expired.'))],
    ['a tokenless result', vi.fn().mockResolvedValue({ token: null })],
  ])('400s on %s', async (_label, resetPassword) => {
    const result = await handleSetPassword(good, deps({ resetPassword }))
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.setPassword.invalidToken })
    expect(result.setCookie).toBeUndefined()
  })
})

describe('handleSetPassword — success', () => {
  it('sets the password and hands back the session cookie', async () => {
    const d = deps()
    const result = await handleSetPassword(good, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true })
    expect(result.setCookie).toBe(cookie('jwt.new.session'))
    expect(d.resetPassword).toHaveBeenCalledWith({ token: 'tok-abc', password: 'moreska2026' })
  })

  it('trims the token but never the password', async () => {
    const d = deps()
    await handleSetPassword({ token: ' tok-abc ', password: ' lozinka1 ', repeat: ' lozinka1 ' }, d)
    expect(d.resetPassword).toHaveBeenCalledWith({ token: 'tok-abc', password: ' lozinka1 ' })
  })
})
