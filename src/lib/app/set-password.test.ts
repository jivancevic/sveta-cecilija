import { describe, expect, it, vi } from 'vitest'
import { handleSetPassword, MIN_PASSWORD_LENGTH, type SetPasswordDeps } from './set-password'
import { APP_STRINGS } from './strings'

const sameOrigin = {
  origin: null,
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function deps(overrides: Partial<SetPasswordDeps> = {}): SetPasswordDeps {
  return {
    request: sameOrigin,
    caller: { id: 7, shared: false },
    setPassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const good = { password: 'moreska2026', repeat: 'moreska2026' }

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
    expect(d.setPassword).not.toHaveBeenCalled()
  })
})

describe('handleSetPassword — refusals', () => {
  it.each([
    ['no body', null, APP_STRINGS.setPassword.tooShort],
    ['a short password', { password: 'kratko', repeat: 'kratko' }, APP_STRINGS.setPassword.tooShort],
    ['a mismatched repeat', { ...good, repeat: 'nesto-drugo' }, APP_STRINGS.setPassword.mismatch],
  ])('400s on %s without writing', async (_label, input, message) => {
    const d = deps()
    const result = await handleSetPassword(input, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: message })
    expect(d.setPassword).not.toHaveBeenCalled()
  })

  it('accepts a password of exactly the minimum length', async () => {
    const pass = 'x'.repeat(MIN_PASSWORD_LENGTH)
    const result = await handleSetPassword({ password: pass, repeat: pass }, deps())
    expect(result.status).toBe(200)
  })

  // ADR-0022: one holder of a shared login may not lock the others out, which
  // is what rotating the password on a login several people use would do. The
  // route runs `overrideAccess: true`, so `Users.access.update` never sees it.
  it('403s a shared login before writing', async () => {
    const d = deps({ caller: { id: 3, shared: true } })
    const result = await handleSetPassword(good, d)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: APP_STRINGS.setPassword.sharedAccount })
    expect(d.setPassword).not.toHaveBeenCalled()
  })

  it('500s when the write fails', async () => {
    const d = deps({ setPassword: vi.fn().mockRejectedValue(new Error('db down')) })
    const result = await handleSetPassword(good, d)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: APP_STRINGS.setPassword.unexpected })
  })
})

describe('handleSetPassword — success', () => {
  it("writes on the CALLER's own row and says so", async () => {
    const d = deps()
    const result = await handleSetPassword(good, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, message: APP_STRINGS.setPassword.saved })
    expect(d.setPassword).toHaveBeenCalledWith(7, 'moreska2026')
  })

  it('never trims the password', async () => {
    const d = deps()
    await handleSetPassword({ password: ' lozinka1 ', repeat: ' lozinka1 ' }, d)
    expect(d.setPassword).toHaveBeenCalledWith(7, ' lozinka1 ')
  })

  // The session is the caller's own and is untouched: no cookie comes back,
  // because there is nothing to replace (#463).
  it('returns no cookie', async () => {
    const result = await handleSetPassword(good, deps())
    expect(result).not.toHaveProperty('setCookie')
  })
})
