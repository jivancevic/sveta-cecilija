import { describe, expect, it, vi } from 'vitest'
import { handleInvite, INVITE_EXPIRATION_MS, setPasswordLink, type InviteDeps } from './invite'
import { APP_STRINGS } from './strings'

const sameOrigin = {
  origin: null,
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const cici = {
  id: 12,
  name: 'Ivan Fabris',
  nickname: 'Cici',
  email: 'cici@example.com',
  isMoreskant: true,
  active: true,
}

function deps(overrides: Partial<InviteDeps> = {}): InviteDeps {
  return {
    request: sameOrigin,
    baseUrl: 'https://moreska.eu',
    loadMember: vi.fn().mockResolvedValue(cici),
    findUserByMember: vi.fn().mockResolvedValue(null),
    usernameTaken: vi.fn().mockResolvedValue(false),
    createUser: vi.fn(async (data) => ({ id: 99, username: data.username, email: data.email })),
    updateUserEmail: vi.fn().mockResolvedValue(undefined),
    issueResetToken: vi.fn().mockResolvedValue('tok-abc'),
    sendInvite: vi.fn().mockResolvedValue(undefined),
    randomPassword: () => 'a-very-random-password',
    ...overrides,
  }
}

describe('handleInvite — the request guard', () => {
  it('403s a cross-site POST before it loads anything', async () => {
    const d = deps({ request: { ...sameOrigin, secFetchSite: 'cross-site' } })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.unexpected })
    expect(d.loadMember).not.toHaveBeenCalled()
  })

  it('403s a foreign Origin', async () => {
    const d = deps({ request: { ...sameOrigin, origin: 'https://evil.example' } })
    expect((await handleInvite({ memberId: '12' }, d)).status).toBe(403)
    expect(d.loadMember).not.toHaveBeenCalled()
  })

  it('415s a form-encoded body', async () => {
    const d = deps({ request: { ...sameOrigin, contentType: 'application/x-www-form-urlencoded' } })
    expect((await handleInvite({ memberId: '12' }, d)).status).toBe(415)
    expect(d.loadMember).not.toHaveBeenCalled()
  })
})

describe('handleInvite — the four refusals', () => {
  it.each([
    ['no member id', null, undefined, APP_STRINGS.invite.missingMember],
    ['an unknown member', { memberId: '404' }, null, APP_STRINGS.invite.missingMember],
    [
      'a member who is not a moreškant',
      { memberId: '12' },
      { ...cici, isMoreskant: false },
      APP_STRINGS.invite.notMoreskant,
    ],
    [
      'an inactive member',
      { memberId: '12' },
      { ...cici, active: false },
      APP_STRINGS.invite.notActive,
    ],
    [
      'a member without an email',
      { memberId: '12' },
      { ...cici, email: null },
      APP_STRINGS.invite.noEmail,
    ],
    [
      'a member whose email is blank',
      { memberId: '12' },
      { ...cici, email: '   ' },
      APP_STRINGS.invite.noEmail,
    ],
  ])('400s on %s, creating nothing and sending nothing', async (_label, input, member, message) => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue(member ?? null) })
    const result = await handleInvite(input, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: message })
    expect(d.createUser).not.toHaveBeenCalled()
    expect(d.issueResetToken).not.toHaveBeenCalled()
    expect(d.sendInvite).not.toHaveBeenCalled()
  })

  it('treats a member load that throws as a missing member', async () => {
    const d = deps({ loadMember: vi.fn().mockRejectedValue(new Error('boom')) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.missingMember })
  })
})

describe('handleInvite — creating the login', () => {
  it('creates exactly the moreskant bundle, linked to the member', async () => {
    const d = deps()
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      created: true,
      username: 'cici',
      message: APP_STRINGS.invite.sentNew,
    })
    expect(d.createUser).toHaveBeenCalledWith({
      username: 'cici',
      email: 'cici@example.com',
      password: 'a-very-random-password',
      permissions: ['moreskant'],
      member: 12,
    })
  })

  it('suffixes the username when the slug is taken', async () => {
    const taken = new Set(['cici'])
    const d = deps({ usernameTaken: vi.fn(async (c: string) => taken.has(c)) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.body).toMatchObject({ username: 'cici2' })
  })

  it('400s with a fixable message when the account cannot be created', async () => {
    const d = deps({ createUser: vi.fn().mockRejectedValue(new Error('duplicate email')) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.createFailed })
    expect(d.sendInvite).not.toHaveBeenCalled()
  })
})

describe('handleInvite — a second press', () => {
  const existing = { id: 99, username: 'cici', email: 'cici@example.com' }

  it('reuses the linked login and never creates a second one', async () => {
    const d = deps({ findUserByMember: vi.fn().mockResolvedValue(existing) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      created: false,
      username: 'cici',
      message: APP_STRINGS.invite.sentAgain,
    })
    expect(d.createUser).not.toHaveBeenCalled()
    expect(d.usernameTaken).not.toHaveBeenCalled()
    // Always a fresh link: that is what a lost email needs.
    expect(d.issueResetToken).toHaveBeenCalledTimes(1)
    expect(d.sendInvite).toHaveBeenCalledTimes(1)
  })

  it("moves the login onto the Member's email when the two drifted apart", async () => {
    const d = deps({
      findUserByMember: vi.fn().mockResolvedValue({ ...existing, email: 'staro@example.com' }),
    })
    await handleInvite({ memberId: '12' }, d)
    expect(d.updateUserEmail).toHaveBeenCalledWith(99, 'cici@example.com')
  })

  it('leaves the login alone when the addresses differ only in case', async () => {
    const d = deps({
      findUserByMember: vi.fn().mockResolvedValue({ ...existing, email: 'CICI@example.com' }),
    })
    await handleInvite({ memberId: '12' }, d)
    expect(d.updateUserEmail).not.toHaveBeenCalled()
  })
})

describe('handleInvite — the token and the mail', () => {
  it('asks for a seven-day token, targeted by username', async () => {
    const d = deps()
    await handleInvite({ memberId: '12' }, d)
    expect(d.issueResetToken).toHaveBeenCalledWith({ username: 'cici' }, INVITE_EXPIRATION_MS)
    expect(INVITE_EXPIRATION_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('falls back to the email when the login somehow has no username', async () => {
    const d = deps({
      findUserByMember: vi.fn().mockResolvedValue({ id: 99, username: null, email: 'cici@example.com' }),
    })
    await handleInvite({ memberId: '12' }, d)
    expect(d.issueResetToken).toHaveBeenCalledWith({ email: 'cici@example.com' }, INVITE_EXPIRATION_MS)
  })

  it('sends the link to the member, greeted by nickname', async () => {
    const d = deps()
    await handleInvite({ memberId: '12' }, d)
    expect(d.sendInvite).toHaveBeenCalledWith({
      to: 'cici@example.com',
      greeting: 'Cici',
      link: 'https://moreska.eu/app/set-password?token=tok-abc',
    })
  })

  it('greets by name when the member has no nickname', async () => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue({ ...cici, nickname: null }) })
    await handleInvite({ memberId: '12' }, d)
    expect(d.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ greeting: 'Ivan Fabris' }))
  })

  it('500s without sending when no token comes back', async () => {
    const d = deps({ issueResetToken: vi.fn().mockResolvedValue(null) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.tokenFailed })
    expect(d.sendInvite).not.toHaveBeenCalled()
  })
})

describe('setPasswordLink', () => {
  it('builds the one link both mails carry', () => {
    expect(setPasswordLink('https://moreska.eu', 'abc')).toBe(
      'https://moreska.eu/app/set-password?token=abc',
    )
  })

  it('tolerates a trailing slash and escapes the token', () => {
    expect(setPasswordLink('https://moreska.eu/', 'a b')).toBe(
      'https://moreska.eu/app/set-password?token=a%20b',
    )
  })
})
