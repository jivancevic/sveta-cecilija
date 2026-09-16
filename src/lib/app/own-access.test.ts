import { describe, expect, it, vi } from 'vitest'
import { handleOwnAccess, LOCKED_KEYS, MIN_PASSWORD_LENGTH, type OwnAccessDeps } from './own-access'
import { APP_STRINGS } from './strings'

// The rules of "E-mail i lozinka" (#651, ADR-0028), one per row.
//
// The four that keep the hole narrow are the point of this file: the row is the
// SESSION's, the locked keys are refused rather than dropped, a shared login is
// refused outright, and the request guard runs before any of it.

const S = APP_STRINGS.ownAccess

/** A fixed clock, so the stamp the handler writes is a value a row can assert. */
const STAMPED_AT = new Date('2026-09-16T10:00:00.000Z')

const sameOrigin = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function deps(over: Partial<OwnAccessDeps> = {}): OwnAccessDeps {
  return {
    request: sameOrigin,
    caller: { id: 42 },
    save: vi.fn().mockResolvedValue(undefined),
    now: () => STAMPED_AT,
    ...over,
  }
}

describe('handleOwnAccess — the request guard', () => {
  it('403s a cross-site request before it writes anything', async () => {
    const d = deps({ request: { ...sameOrigin, secFetchSite: 'cross-site' } })
    const res = await handleOwnAccess({ email: 'ja@example.com' }, d)
    expect(res.status).toBe(403)
    expect(d.save).not.toHaveBeenCalled()
  })

  it('415s a form-encoded body', async () => {
    const d = deps({ request: { ...sameOrigin, contentType: 'application/x-www-form-urlencoded' } })
    expect((await handleOwnAccess({ email: 'ja@example.com' }, d)).status).toBe(415)
    expect(d.save).not.toHaveBeenCalled()
  })
})

describe('handleOwnAccess — the row is the caller’s own', () => {
  it.each([
    ['another account by id', 7],
    ['another account as a string', '7'],
    ['an empty target', ''],
    ['a nonsense target', { id: 42 }],
  ])('403s a body aiming at %s', async (_label, userId) => {
    const d = deps()
    const res = await handleOwnAccess({ userId, email: 'ja@example.com' } as never, d)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.otherAccount })
    expect(d.save).not.toHaveBeenCalled()
  })

  it('accepts its own id, written either way, and still saves to the session id', async () => {
    for (const userId of [42, '42']) {
      const d = deps()
      const res = await handleOwnAccess({ userId, email: 'ja@example.com' } as never, d)
      expect(res.status).toBe(200)
      expect(d.save).toHaveBeenCalledWith(42, { email: 'ja@example.com' })
    }
  })

  it('writes the session’s id when the body names nobody', async () => {
    const d = deps({ caller: { id: 'abc' } })
    await handleOwnAccess({ email: 'ja@example.com' }, d)
    expect(d.save).toHaveBeenCalledWith('abc', { email: 'ja@example.com' })
  })
})

describe('handleOwnAccess — what a dancer may not send', () => {
  it.each(LOCKED_KEYS)('403s a body carrying %s', async (key) => {
    const d = deps()
    const res = await handleOwnAccess({ [key]: 'nešto', email: 'ja@example.com' } as never, d)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.lockedField })
    expect(d.save).not.toHaveBeenCalled()
  })

  it('names the whole set, so nothing Korisnici owns can be smuggled in', () => {
    expect([...LOCKED_KEYS].sort()).toEqual(
      [
        'member',
        'name',
        'note',
        'passwordSetAt',
        'permissions',
        'shared',
        'tabs',
        'username',
      ].sort(),
    )
  })

  it('403s a shared login on both fields (ADR-0022)', async () => {
    const d = deps({ caller: { id: 42, shared: true } })
    const res = await handleOwnAccess({ email: 'ja@example.com', password: 'dobra-lozinka' }, d)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.sharedAccount })
    expect(d.save).not.toHaveBeenCalled()
  })
})

describe('handleOwnAccess — the address', () => {
  it('lower-cases and trims it', async () => {
    const d = deps()
    await handleOwnAccess({ email: '  Cici@Example.COM ' }, d)
    expect(d.save).toHaveBeenCalledWith(42, { email: 'cici@example.com' })
  })

  it.each(['cici', 'cici@', '@example.com', 'ci ci@example.com'])(
    '400s on %s',
    async (email) => {
      const d = deps()
      const res = await handleOwnAccess({ email }, d)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: S.badEmail })
      expect(d.save).not.toHaveBeenCalled()
    },
  )

  it('clears the address when the field is emptied', async () => {
    const d = deps()
    const res = await handleOwnAccess({ email: '   ' }, d)
    expect(res.status).toBe(200)
    expect(d.save).toHaveBeenCalledWith(42, { email: null })
  })

  it('409s when the address already belongs to somebody else', async () => {
    const d = deps({ save: vi.fn().mockResolvedValue('email-taken') })
    const res = await handleOwnAccess({ email: 'ja@example.com' }, d)
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: S.emailTaken })
  })

  it('400s when the account may not be left without one (a voditelj)', async () => {
    const d = deps({ save: vi.fn().mockResolvedValue('email-required') })
    const res = await handleOwnAccess({ email: '' }, d)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.emailRequired })
  })
})

describe('handleOwnAccess — the password', () => {
  it('saves a long enough password that matches its repeat', async () => {
    const d = deps()
    const res = await handleOwnAccess({ password: 'moreska2026', repeat: 'moreska2026' }, d)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, message: S.saved })
    expect(d.save).toHaveBeenCalledWith(42, {
      password: 'moreska2026',
      passwordSetAt: STAMPED_AT.toISOString(),
    })
  })

  it('400s a short one', async () => {
    const d = deps()
    const res = await handleOwnAccess({ password: 'kratko', repeat: 'kratko' }, d)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.tooShort })
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })

  it('400s a mismatched repeat', async () => {
    const d = deps()
    const res = await handleOwnAccess({ password: 'moreska2026', repeat: 'nesto-drugo' }, d)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.mismatch })
  })

  it('takes a password verbatim, spaces and all', async () => {
    const d = deps()
    await handleOwnAccess({ password: ' dva slova ', repeat: ' dva slova ' }, d)
    expect(d.save).toHaveBeenCalledWith(42, {
      password: ' dva slova ',
      passwordSetAt: STAMPED_AT.toISOString(),
    })
  })
})

describe('handleOwnAccess — one task, two fields', () => {
  it('writes both when the form sends both', async () => {
    const d = deps()
    const res = await handleOwnAccess(
      { email: 'ja@example.com', password: 'moreska2026', repeat: 'moreska2026' },
      d,
    )
    expect(res.status).toBe(200)
    expect(d.save).toHaveBeenCalledWith(42, {
      email: 'ja@example.com',
      password: 'moreska2026',
      passwordSetAt: STAMPED_AT.toISOString(),
    })
  })

  it('reads empty password boxes as "not changing it", not as an error', async () => {
    const d = deps()
    const res = await handleOwnAccess({ email: 'ja@example.com', password: '', repeat: '' }, d)
    expect(res.status).toBe(200)
    // No stamp either: nothing was chosen, so nothing may claim it was (#653
    // review). An address alone must never make the 🔑 mark or the Početna card
    // call the task done.
    expect(d.save).toHaveBeenCalledWith(42, { email: 'ja@example.com' })
  })

  /**
   * The stamp that makes "this person chose their own password" knowable.
   *
   * Every invited account already HAS a password — `ensureDancerLogin` mints a
   * random one — so the hash cannot tell the two apart. This handler is the one
   * place a person types theirs, so it is where the fact is recorded.
   */
  it('stamps the moment a password is actually chosen, and only then', async () => {
    const withPassword = deps()
    await handleOwnAccess({ password: 'moreska2026', repeat: 'moreska2026' }, withPassword)
    expect(withPassword.save).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ passwordSetAt: STAMPED_AT.toISOString() }),
    )

    const addressOnly = deps()
    await handleOwnAccess({ email: 'ja@example.com' }, addressOnly)
    expect(addressOnly.save).toHaveBeenCalledWith(42, { email: 'ja@example.com' })
  })

  it('refuses a body that tries to stamp itself', async () => {
    const d = deps()
    const res = await handleOwnAccess(
      { passwordSetAt: new Date().toISOString() } as never,
      d,
    )
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.lockedField })
    expect(d.save).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty body', {}],
    ['no body at all', null],
    ['nothing but empty password boxes', { password: '', repeat: '' }],
  ])('400s on %s rather than writing nothing', async (_label, body) => {
    const d = deps()
    const res = await handleOwnAccess(body, d)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.nothingToSave })
    expect(d.save).not.toHaveBeenCalled()
  })

  it('500s when the write itself fails', async () => {
    const d = deps({ save: vi.fn().mockRejectedValue(new Error('down')) })
    const res = await handleOwnAccess({ email: 'ja@example.com' }, d)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: S.unexpected })
  })
})
