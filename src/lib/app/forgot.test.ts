import { describe, expect, it, vi } from 'vitest'
import { handleForgot, RESET_EXPIRATION_MS, type ForgotDeps } from './forgot'
import { APP_STRINGS } from './strings'

const sameOrigin = {
  origin: null,
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const account = { id: 99, username: 'cici', email: 'cici@example.com', name: 'Ivan Fabris' }

function deps(overrides: Partial<ForgotDeps> = {}): ForgotDeps {
  return {
    request: sameOrigin,
    baseUrl: 'https://moreska.eu',
    findAccount: vi.fn().mockResolvedValue(account),
    issueResetToken: vi.fn().mockResolvedValue('tok-reset'),
    sendReset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const sent = { ok: true, message: APP_STRINGS.forgot.sent }

describe('handleForgot — the request guard', () => {
  it.each([
    ['cross-site', { ...sameOrigin, secFetchSite: 'cross-site' }, 403],
    ['a foreign Origin', { ...sameOrigin, origin: 'https://evil.example' }, 403],
    ['a form body', { ...sameOrigin, contentType: 'multipart/form-data' }, 415],
  ])('refuses %s before looking anything up', async (_label, request, status) => {
    const d = deps({ request })
    const result = await handleForgot({ identifier: 'cici' }, d)
    expect(result.status).toBe(status)
    expect(d.findAccount).not.toHaveBeenCalled()
  })
})

describe('handleForgot — one answer for everyone', () => {
  it.each([
    ['a known account', account],
    ['an unknown account', null],
    ['an account with no email (tehnika, a partner POS)', { id: 3, username: 'tehnika', email: null }],
    ['an account whose email is blank', { id: 3, username: 'tehnika', email: '  ' }],
  ])('answers 200 with the same sentence for %s', async (_label, found) => {
    const d = deps({ findAccount: vi.fn().mockResolvedValue(found) })
    const result = await handleForgot({ identifier: 'cici' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual(sent)
  })

  it.each([
    ['an unknown account', null],
    ['an account with no email', { id: 3, username: 'tehnika', email: null }],
  ])('sends nothing for %s', async (_label, found) => {
    const d = deps({ findAccount: vi.fn().mockResolvedValue(found) })
    await handleForgot({ identifier: 'cici' }, d)
    expect(d.issueResetToken).not.toHaveBeenCalled()
    expect(d.sendReset).not.toHaveBeenCalled()
  })

  it('stays 200 when the lookup itself throws', async () => {
    const d = deps({ findAccount: vi.fn().mockRejectedValue(new Error('db down')) })
    expect(await handleForgot({ identifier: 'cici' }, d)).toEqual({ status: 200, body: sent })
  })

  it('stays 200 when the mail fails', async () => {
    const d = deps({ sendReset: vi.fn().mockRejectedValue(new Error('brevo down')) })
    expect(await handleForgot({ identifier: 'cici' }, d)).toEqual({ status: 200, body: sent })
  })

  it.each([
    ['no body', null],
    ['an empty identifier', { identifier: '   ' }],
    ['a non-string identifier', { identifier: 7 }],
  ])('400s on %s, which is the typing and not an account fact', async (_label, input) => {
    const d = deps()
    const result = await handleForgot(input, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.forgot.missing })
    expect(d.findAccount).not.toHaveBeenCalled()
  })
})

describe('handleForgot — the lookup and the link', () => {
  it.each([
    ['an email', 'Cici@Example.com', { email: 'cici@example.com' }],
    ['a username', 'CICI', { username: 'cici' }],
  ])('looks %s up in the right field', async (_label, identifier, expected) => {
    const d = deps()
    await handleForgot({ identifier }, d)
    expect(d.findAccount).toHaveBeenCalledWith(expected)
  })

  it('asks for a one-hour token and mails the set-password link', async () => {
    const d = deps()
    await handleForgot({ identifier: 'cici' }, d)
    expect(d.issueResetToken).toHaveBeenCalledWith({ username: 'cici' }, RESET_EXPIRATION_MS)
    expect(RESET_EXPIRATION_MS).toBe(60 * 60 * 1000)
    expect(d.sendReset).toHaveBeenCalledWith({
      to: 'cici@example.com',
      greeting: 'Ivan Fabris',
      link: 'https://moreska.eu/app/set-password?token=tok-reset',
    })
  })

  it('sends nothing when no token comes back', async () => {
    const d = deps({ issueResetToken: vi.fn().mockResolvedValue(null) })
    const result = await handleForgot({ identifier: 'cici' }, d)
    expect(result.body).toEqual(sent)
    expect(d.sendReset).not.toHaveBeenCalled()
  })
})
