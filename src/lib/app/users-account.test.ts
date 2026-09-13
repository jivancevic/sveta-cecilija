import { describe, expect, it, vi } from 'vitest'
import { APP_STRINGS } from './strings'
import {
  TEMP_PASSWORD_ALPHABET,
  TEMP_PASSWORD_LENGTH,
  generateTemporaryPassword,
  handleCreateUser,
  handleResetPassword,
  normaliseUsername,
  type CreateUserDeps,
  type ResetPasswordDeps,
} from './users-account'
import type { UsersTarget } from './users-admin'

const S = APP_STRINGS.users

const SAME_SITE = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function target(over: Partial<UsersTarget> = {}): UsersTarget {
  return {
    id: '7',
    username: 'tehnika',
    name: null,
    email: null,
    permissions: ['door'],
    shared: true,
    ...over,
  }
}

function createDeps(over: Partial<CreateUserDeps> = {}): CreateUserDeps {
  return {
    request: SAME_SITE,
    baseUrl: 'https://moreska.eu',
    usernameTaken: async () => false,
    emailTaken: async () => false,
    create: vi.fn(async (data) => ({ id: '42', username: data.username })),
    issueResetToken: async () => 'tok123',
    temporaryPassword: () => 'Temp-1234-abcd',
    unusablePassword: () => 'unusable-long-hex',
    ...over,
  }
}

function resetDeps(over: Partial<ResetPasswordDeps> = {}): ResetPasswordDeps {
  return {
    request: SAME_SITE,
    caller: { id: '1', shared: false },
    baseUrl: 'https://moreska.eu',
    loadUser: async () => target(),
    setPassword: vi.fn(async () => {}),
    issueResetToken: async () => 'tok123',
    temporaryPassword: () => 'Temp-1234-abcd',
    ...over,
  }
}

describe('generateTemporaryPassword', () => {
  it('is long enough to be handed over and not guessed', () => {
    expect(generateTemporaryPassword().length).toBe(TEMP_PASSWORD_LENGTH)
    expect(TEMP_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12)
  })

  it('uses only characters a person can read off a screen and type back', () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of generateTemporaryPassword()) {
        expect(TEMP_PASSWORD_ALPHABET).toContain(ch)
      }
    }
  })

  it('leaves the letters and digits that get mistaken for each other out', () => {
    // A password read off a phone and typed into another one: l/1/I and 0/O are
    // the pairs that turn a handover into a support call.
    for (const ambiguous of ['l', 'I', '1', 'O', '0', 'o']) {
      expect(TEMP_PASSWORD_ALPHABET).not.toContain(ambiguous)
    }
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()))
    expect(seen.size).toBe(50)
  })

  it('draws without modulo bias: every value maps to exactly one character', () => {
    // A fixed byte stream whose values straddle the alphabet length proves the
    // rejection sampling: out-of-range draws are skipped, never folded.
    const n = TEMP_PASSWORD_ALPHABET.length
    const bytes = [0, 255, n - 1, 255, 1]
    const random = (count: number) => {
      const out = new Uint8Array(count)
      for (let i = 0; i < count; i++) out[i] = bytes[i % bytes.length]
      return out
    }
    const password = generateTemporaryPassword(random, 3)
    expect(password).toBe(
      TEMP_PASSWORD_ALPHABET[0] + TEMP_PASSWORD_ALPHABET[n - 1] + TEMP_PASSWORD_ALPHABET[1],
    )
  })
})

describe('normaliseUsername', () => {
  it('lowercases and trims what was typed', () => {
    expect(normaliseUsername('  TTvigna ')).toBe('ttvigna')
  })

  it('refuses anything a login field would not carry', () => {
    expect(normaliseUsername('ana marić')).toBeNull()
    expect(normaliseUsername('a')).toBeNull()
    expect(normaliseUsername('-ana')).toBeNull()
    expect(normaliseUsername('')).toBeNull()
  })

  it('keeps the shapes the society already uses', () => {
    expect(normaliseUsername('josip.ivancevic00')).toBe('josip.ivancevic00')
    expect(normaliseUsername('djuro-mali')).toBe('djuro-mali')
  })
})

describe('POST /api/app/users', () => {
  it('opens an email-less door login and shows its password once', async () => {
    const create = vi.fn(async () => ({ id: '42', username: 'tehnika2' }))
    const res = await handleCreateUser(
      { username: 'Tehnika2', permissions: ['door'], shared: true },
      createDeps({ create }),
    )

    expect(res.status).toBe(200)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'tehnika2',
        permissions: ['door'],
        shared: true,
        password: 'Temp-1234-abcd',
      }),
    )
    expect(res.body).toMatchObject({
      ok: true,
      id: '42',
      handover: { kind: 'password', password: 'Temp-1234-abcd' },
    })
  })

  it('gives an account with an e-mail a sign-in link instead, and never a password', async () => {
    const create = vi.fn(async () => ({ id: '43', username: 'ana' }))
    const res = await handleCreateUser(
      { username: 'ana', email: 'Ana@Moreska.eu', name: 'Ana Anić', permissions: ['tickets'] },
      createDeps({ create }),
    )

    expect(res.status).toBe(200)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ana@moreska.eu',
        name: 'Ana Anić',
        // The account gets a password nobody will ever hold: the link is the
        // way in, so a 14-character one would be a live credential in nobody's
        // hands.
        password: 'unusable-long-hex',
      }),
    )
    expect(res.body).toMatchObject({
      handover: { kind: 'link', link: 'https://moreska.eu/app/session?token=tok123' },
    })
    expect(JSON.stringify(res.body)).not.toContain('unusable-long-hex')
  })

  it('refuses a username a login field could not carry', async () => {
    const create = vi.fn()
    const res = await handleCreateUser(
      { username: 'ana marić', permissions: ['door'] },
      createDeps({ create }),
    )
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.create.badUsername })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a named-person set with no e-mail', async () => {
    const res = await handleCreateUser(
      { username: 'ana', permissions: ['tickets'] },
      createDeps(),
    )
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.permissions.emailRequired })
  })

  it('refuses a word outside the vocabulary', async () => {
    const res = await handleCreateUser(
      { username: 'ana', permissions: ['boss'] },
      createDeps(),
    )
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.permissions.invalid })
  })

  it('409s a username somebody already has', async () => {
    const res = await handleCreateUser(
      { username: 'tehnika', permissions: ['door'] },
      createDeps({ usernameTaken: async () => true }),
    )
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: S.create.usernameTaken })
  })

  it('409s an address that already has an account', async () => {
    const res = await handleCreateUser(
      { username: 'ana', email: 'ana@moreska.eu', permissions: ['tickets'] },
      createDeps({ emailTaken: async () => true }),
    )
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: S.create.emailTaken })
  })

  it('refuses a cross-site request before it creates anything', async () => {
    const create = vi.fn()
    const res = await handleCreateUser(
      { username: 'ana', permissions: ['door'] },
      createDeps({ create, request: { ...SAME_SITE, secFetchSite: 'cross-site' } }),
    )
    expect(res.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })

  it('says the account exists even when the link could not be minted', async () => {
    const res = await handleCreateUser(
      { username: 'ana', email: 'ana@moreska.eu', permissions: ['tickets'] },
      createDeps({ issueResetToken: async () => null }),
    )
    // The account IS there; telling the reader it failed would have them press
    // again and collide with their own username.
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ handover: { kind: 'none' } })
  })
})

describe('POST /api/app/users/[id]/reset-password', () => {
  it('hands over a new password when there is no address to send to', async () => {
    const setPassword = vi.fn(async () => {})
    const res = await handleResetPassword('7', resetDeps({ setPassword }))

    expect(res.status).toBe(200)
    expect(setPassword).toHaveBeenCalledWith('7', 'Temp-1234-abcd')
    expect(res.body).toMatchObject({ handover: { kind: 'password', password: 'Temp-1234-abcd' } })
  })

  it('mints a sign-in link for an account that has one, and changes no password', async () => {
    const setPassword = vi.fn(async () => {})
    const res = await handleResetPassword(
      '7',
      resetDeps({
        setPassword,
        loadUser: async () => target({ email: 'tatjana@moreska.eu', username: 'ttvigna' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(setPassword).not.toHaveBeenCalled()
    expect(res.body).toMatchObject({
      handover: { kind: 'link', link: 'https://moreska.eu/app/session?token=tok123' },
    })
  })

  it('refuses a shared login resetting itself', async () => {
    const res = await handleResetPassword(
      '7',
      resetDeps({
        caller: { id: '7', shared: true },
        loadUser: async () => target({ id: '7', shared: true }),
      }),
    )
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.sharedSelf })
  })

  it('404s an id that is nobody', async () => {
    const res = await handleResetPassword('99', resetDeps({ loadUser: async () => null }))
    expect(res.status).toBe(404)
  })

  it('answers 500 rather than showing a password it could not save', async () => {
    const res = await handleResetPassword(
      '7',
      resetDeps({
        setPassword: async () => {
          throw new Error('db')
        },
      }),
    )
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: S.reset.failed })
  })

  it('refuses to build a link against a base URL nothing can open', async () => {
    const res = await handleResetPassword(
      '7',
      resetDeps({
        baseUrl: '',
        loadUser: async () => target({ email: 'tatjana@moreska.eu' }),
      }),
    )
    expect(res.status).toBe(500)
  })
})
