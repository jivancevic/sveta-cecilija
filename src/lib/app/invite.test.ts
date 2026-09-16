import { describe, expect, it, vi } from 'vitest'
import {
  handleInvite,
  handleInviteLink,
  INVITE_EXPIRATION_MS,
  isDancerLogin,
  isUsableBaseUrl,
  signInLink,
  type InviteDeps,
} from './invite'
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
  mobile: '091 234 5678',
  isMoreskant: true,
  active: true,
}

/** The login of a dancer who has set an address of their own (#651). */
const withEmail = { id: 99, username: 'cici', email: 'cici@example.com' }

function deps(overrides: Partial<InviteDeps> = {}): InviteDeps {
  return {
    request: sameOrigin,
    baseUrl: 'https://moreska.eu',
    loadMember: vi.fn().mockResolvedValue(cici),
    findUserByMember: vi.fn().mockResolvedValue(null),
    usernameTaken: vi.fn().mockResolvedValue(false),
    createUser: vi.fn(async (data) => ({ id: 99, username: data.username, email: null })),
    issueResetToken: vi.fn().mockResolvedValue('tok-abc'),
    sendInvite: vi.fn().mockResolvedValue(undefined),
    randomPassword: () => 'a-very-random-password',
    ...overrides,
  }
}

/**
 * Deps for the LETTER, which since #651 presupposes a login with an address:
 * the mail channel refuses everything else before it opens anything.
 */
function mailDeps(overrides: Partial<InviteDeps> = {}): InviteDeps {
  return deps({ findUserByMember: vi.fn().mockResolvedValue(withEmail), ...overrides })
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
      'a dancer whose login has no address of their own',
      { memberId: '12' },
      cici,
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

/**
 * The letter, after #651 (ADR-0028).
 *
 * The address is the LOGIN's now, so a letter can only ever go to a dancer who
 * has already typed one. A dancer with no login yet has no address anywhere,
 * which is why the first press on most of the roster is refused here and handed
 * to "Kopiraj pozivnicu" instead.
 */
describe('handleInvite — the letter needs an address the dancer owns', () => {
  it('refuses before it opens an account, so no row is left behind', async () => {
    const d = deps()
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.noEmail })
    expect(d.createUser).not.toHaveBeenCalled()
    expect(d.issueResetToken).not.toHaveBeenCalled()
    expect(d.sendInvite).not.toHaveBeenCalled()
  })

  it('refuses a login whose address is blank', async () => {
    const d = deps({ findUserByMember: vi.fn().mockResolvedValue({ ...withEmail, email: '  ' }) })
    expect((await handleInvite({ memberId: '12' }, d)).status).toBe(400)
    expect(d.sendInvite).not.toHaveBeenCalled()
  })

  it('writes the letter to the LOGIN’s address and never to the Member row', async () => {
    const d = deps({ findUserByMember: vi.fn().mockResolvedValue(withEmail) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(200)
    expect(d.sendInvite).toHaveBeenCalledWith({
      to: 'cici@example.com',
      greeting: 'Cici',
      link: 'https://moreska.eu/app/session?token=tok-abc',
    })
  })
})

describe('handleInvite — a second press', () => {
  const existing = withEmail

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

  /**
   * The rule "the Member's email wins" stood here until #651 and is GONE, not
   * moved: an invitation press used to write the Member's address onto the
   * login, which after ADR-0028 would overwrite what the dancer typed for
   * themselves. Asserted as an absence, because that is what a regression here
   * would look like.
   */
  it('writes nothing at all to the login it found', async () => {
    const d = deps({
      findUserByMember: vi.fn().mockResolvedValue({ ...existing, email: 'moje@example.com' }),
    })
    await handleInvite({ memberId: '12' }, d)
    expect(d.sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'moje@example.com' }),
    )
    expect(d.createUser).not.toHaveBeenCalled()
  })
})

/**
 * The takeover guard (#462 review).
 *
 * A press mints a live sign-in token for the login behind the Member and either
 * mails it or hands it to the presser. On a dancer that is the fix for a lost
 * letter. On an account that also holds `moreska`, `tickets` or `users` it is a
 * takeover, because any voditelj may press it on any Member.
 * `/api/app/link-self` makes exactly that link routine, which is why the rule
 * lands with it.
 */
describe('handleInvite — the login behind the Member is not a dancer', () => {
  const staff = {
    id: 31,
    username: 'voditelj',
    email: 'voditelj@moreska.eu',
    permissions: ['moreska', 'moreskant'],
  }

  it('refuses before it mints a token', async () => {
    const d = deps({ findUserByMember: vi.fn().mockResolvedValue(staff) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.staffLogin })
    expect(d.issueResetToken).not.toHaveBeenCalled()
    expect(d.sendInvite).not.toHaveBeenCalled()
  })

  it.each([
    ['a superadmin', ['users', 'tickets', 'moreska', 'moreskant']],
    ['a ticketing account', ['tickets']],
    ['a door account that also sells', ['door', 'tickets']],
  ])('refuses %s', async (_label, permissions) => {
    const d = deps({ findUserByMember: vi.fn().mockResolvedValue({ ...staff, permissions }) })
    expect((await handleInvite({ memberId: '12' }, d)).status).toBe(409)
  })

  it.each([
    ['a plain dancer', ['moreskant']],
    // #520, reversing the #462 rule: the door person who dances is ONE account
    // (#487), and a door login reaches no further than shared `tehnika` does.
    ['a door person who also dances', ['door', 'moreskant']],
    ['a door-only login', ['door']],
    ['a login from before the permission vocabulary', []],
    ['a login whose set could not be read', null],
  ])('still re-invites %s', async (_label, permissions) => {
    const d = deps({ findUserByMember: vi.fn().mockResolvedValue({ ...staff, permissions }) })
    expect((await handleInvite({ memberId: '12' }, d)).status).toBe(200)
    expect(d.sendInvite).toHaveBeenCalledTimes(1)
  })

  it('does not stand between a Member and their FIRST login', async () => {
    // Nobody to check: the account this press creates holds ['moreskant'].
    // Asserted on the LINK channel, because since #651 the letter is the one
    // that cannot open an account (it has no address to write to yet).
    const d = deps({ findUserByMember: vi.fn().mockResolvedValue(null) })
    expect((await handleInviteLink({ memberId: '12' }, d)).status).toBe(200)
    expect(d.createUser).toHaveBeenCalledTimes(1)
  })
})

describe('isDancerLogin', () => {
  it.each([
    ['no login at all', null, true],
    ['an empty set', { id: 1, permissions: [] }, true],
    ['a missing set', { id: 1 }, true],
    ['exactly moreskant', { id: 1, permissions: ['moreskant'] }, true],
    // #520: a door login reaches no further than the shared `tehnika` account,
    // so the door person who dances keeps ONE account and stays invitable.
    ['exactly door', { id: 1, permissions: ['door'] }, true],
    ['door and moreskant', { id: 1, permissions: ['door', 'moreskant'] }, true],
    ['door plus a staff word', { id: 1, permissions: ['door', 'tickets'] }, false],
    ['moreska alone', { id: 1, permissions: ['moreska'] }, false],
    ['moreska too', { id: 1, permissions: ['moreskant', 'moreska'] }, false],
    ['tickets', { id: 1, permissions: ['tickets'] }, false],
    ['users', { id: 1, permissions: ['users'] }, false],
    ['an unknown word, which is still not moreskant', { id: 1, permissions: ['xyz'] }, false],
  ])('%s → %s', (_label, user, expected) => {
    expect(isDancerLogin(user)).toBe(expected)
  })
})

describe('handleInvite — the token and the mail', () => {
  it('asks for a seven-day token, targeted by username', async () => {
    const d = mailDeps()
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
    const d = mailDeps()
    await handleInvite({ memberId: '12' }, d)
    expect(d.sendInvite).toHaveBeenCalledWith({
      to: 'cici@example.com',
      greeting: 'Cici',
      link: 'https://moreska.eu/app/session?token=tok-abc',
    })
  })

  it('greets by name when the member has no nickname', async () => {
    const d = mailDeps({ loadMember: vi.fn().mockResolvedValue({ ...cici, nickname: null }) })
    await handleInvite({ memberId: '12' }, d)
    expect(d.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ greeting: 'Ivan Fabris' }))
  })

  it('500s without sending when no token comes back', async () => {
    const d = mailDeps({ issueResetToken: vi.fn().mockResolvedValue(null) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.tokenFailed })
    expect(d.sendInvite).not.toHaveBeenCalled()
  })
})

describe('signInLink', () => {
  it('builds the one link both mails carry', () => {
    expect(signInLink('https://moreska.eu', 'abc')).toBe(
      'https://moreska.eu/app/session?token=abc',
    )
  })

  it('tolerates a trailing slash and escapes the token', () => {
    expect(signInLink('https://moreska.eu/', 'a b')).toBe(
      'https://moreska.eu/app/session?token=a%20b',
    )
  })
})

describe('handleInvite — the mail can fail after the account exists', () => {
  it('502s with a message that says the login is there and the letter is not', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = mailDeps({ sendInvite: vi.fn().mockRejectedValue(new Error('brevo down')) })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(502)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.sendFailed })
    // The token is real and so is the login; pressing again is the fix.
    expect(d.issueResetToken).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('handleInvite — a broken base URL', () => {
  it.each([
    ['unset', ''],
    ['relative', '/app'],
    ['not a URL', 'moreska.eu'],
    ['a mailto', 'mailto:info@moreska.eu'],
  ])('500s on a %s base URL before touching anything', async (_label, baseUrl) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({ baseUrl })
    const result = await handleInvite({ memberId: '12' }, d)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.baseUrlMissing })
    expect(d.loadMember).not.toHaveBeenCalled()
    expect(d.createUser).not.toHaveBeenCalled()
    expect(d.issueResetToken).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('isUsableBaseUrl', () => {
  it.each([
    ['https://moreska.eu', true],
    ['http://localhost:3424', true],
    ['', false],
    ['   ', false],
    ['/app', false],
    ['moreska.eu', false],
    ['mailto:info@moreska.eu', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (value, expected) => {
    expect(isUsableBaseUrl(value)).toBe(expected)
  })
})

/**
 * "Kopiraj pozivnicu" (#463): the same invitation, handed to the voditelj.
 *
 * The point of these is that this is NOT a second invitation rule. Both
 * channels run `mintInvitation`, so what is worth asserting is the one
 * difference (an address is optional) and that everything else — the bundle,
 * the takeover guard, the seven-day token — still holds when no letter is sent.
 */
describe('handleInviteLink', () => {
  const noEmail = cici
  const link = 'https://moreska.eu/app/session?token=tok-abc'

  it('mints a link for a dancer with no e-mail at all', async () => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue(noEmail) })
    const result = await handleInviteLink({ memberId: '12' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      created: true,
      username: 'cici',
      link,
      message: APP_STRINGS.inviteLink.message('Cici', link),
      mobile: '091 234 5678',
      name: 'Cici',
    })
    expect(d.sendInvite).not.toHaveBeenCalled()
  })

  it('creates the login WITHOUT an email key, so two address-less dancers both fit', async () => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue(noEmail) })
    await handleInviteLink({ memberId: '12' }, d)
    expect(d.createUser).toHaveBeenCalledWith({
      username: 'cici',
      password: 'a-very-random-password',
      permissions: ['moreskant'],
      member: 12,
    })
  })

  it('asks for the same seven-day token as the letter', async () => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue(noEmail) })
    await handleInviteLink({ memberId: '12' }, d)
    expect(d.issueResetToken).toHaveBeenCalledWith({ username: 'cici' }, INVITE_EXPIRATION_MS)
  })

  it('leaves a login that already has an address exactly as it was', async () => {
    const d = deps({ findUserByMember: vi.fn().mockResolvedValue(withEmail) })
    const result = await handleInviteLink({ memberId: '12' }, d)
    expect(result.status).toBe(200)
    expect(d.createUser).not.toHaveBeenCalled()
  })

  // A copied sign-in link is a session in a text message, so aiming one at a
  // colleague's staff account is the #462 takeover by a quieter route.
  it('409s when the Member’s login is a staff account', async () => {
    const d = deps({
      findUserByMember: vi.fn().mockResolvedValue({
        id: 4,
        username: 'ana',
        email: 'ana@example.com',
        permissions: ['tickets'],
      }),
    })
    const result = await handleInviteLink({ memberId: '12' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.staffLogin })
    expect(d.issueResetToken).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a member who is not a moreškant',
      { ...noEmail, isMoreskant: false },
      APP_STRINGS.invite.notMoreskant,
    ],
    ['an inactive member', { ...noEmail, active: false }, APP_STRINGS.invite.notActive],
  ])('400s on %s', async (_label, member, message) => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue(member) })
    const result = await handleInviteLink({ memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: message })
  })

  it('403s a cross-site POST', async () => {
    const d = deps({ request: { ...sameOrigin, secFetchSite: 'cross-site' } })
    const result = await handleInviteLink({ memberId: '12' }, d)
    expect(result.status).toBe(403)
    expect(d.loadMember).not.toHaveBeenCalled()
  })
})
