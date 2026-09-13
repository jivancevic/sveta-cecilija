import { describe, expect, it } from 'vitest'
import { APP_STRINGS } from './strings'
import { handleTokenLogin } from './token-login'
import { handleCreateUser, type CreateUserDeps } from './users-account'
import { handleResetPassword, type ResetPasswordDeps } from './users-account'
import type { UsersTarget } from './users-admin'

// The loop #510's review found broken: **the link Korisnici hands over has to
// open the session it promises.**
//
// Both halves were unit-tested and both were green. `handleCreateUser` minted a
// link for a new `tickets` login; `handleTokenLogin` refused any account that
// was not `moreskant` or `moreska`; and because the create also gave such an
// account a deliberately unusable password, a staff login opened from Cecilija
// could not be signed into at all. Nothing asserted the join, so nothing failed.
//
// So this file asserts the join, and only the join. One in-memory store stands
// where Payload would: a users table, and a reset-token table the mint writes
// and the session handler reads. No stubbed `issueResetToken` on the consuming
// side — the token that comes back in the link is the token the session is
// opened with, which is the thing that was wrong.

const SAME_SITE = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

/** The two tables this flow touches, and nothing else. */
function store() {
  const users = new Map<string, UsersTarget & { password: string }>()
  const tokens = new Map<string, string>()
  let nextId = 1

  return {
    users,
    tokens,

    /** Payload's `forgotPassword`, as far as this flow can tell. */
    issueResetToken: async (target: { username?: string; email?: string }) => {
      const found = [...users.values()].find(
        (u) => u.username === target.username || (target.email && u.email === target.email),
      )
      if (!found) return null
      const token = `tok-${found.id}-${tokens.size + 1}`
      tokens.set(token, found.id)
      return token
    },

    /** `findUserByResetToken`: the live-token lookup the session handler makes. */
    findUserByToken: async (token: string) => {
      const id = tokens.get(token)
      const user = id ? users.get(id) : undefined
      return user ? { id: user.id, permissions: user.permissions, shared: user.shared } : null
    },

    create: async (data: {
      username: string
      email?: string
      name?: string
      permissions: UsersTarget['permissions']
      shared: boolean
      password: string
    }) => {
      const id = String(nextId++)
      users.set(id, {
        id,
        username: data.username,
        name: data.name ?? null,
        email: data.email ?? null,
        permissions: data.permissions,
        shared: data.shared,
        password: data.password,
      })
      return { id, username: data.username }
    },
  }
}

function createDeps(db: ReturnType<typeof store>): CreateUserDeps {
  return {
    request: SAME_SITE,
    caller: { id: '999', shared: false },
    baseUrl: 'https://moreska.eu',
    usernameTaken: async (username) => [...db.users.values()].some((u) => u.username === username),
    emailTaken: async (email) => [...db.users.values()].some((u) => u.email === email),
    create: db.create,
    issueResetToken: db.issueResetToken,
    temporaryPassword: () => 'Temp-1234-abcd',
    unusablePassword: () => 'unusable',
  }
}

function resetDeps(db: ReturnType<typeof store>): ResetPasswordDeps {
  return {
    request: SAME_SITE,
    caller: { id: '999', shared: false },
    baseUrl: 'https://moreska.eu',
    loadUser: async (id) => db.users.get(id) ?? null,
    setPassword: async (id, password) => {
      const user = db.users.get(id)
      if (user) db.users.set(id, { ...user, password })
    },
    issueResetToken: db.issueResetToken,
    temporaryPassword: () => 'Temp-1234-abcd',
  }
}

/** `https://moreska.eu/app/session?token=…` → the token itself. */
function tokenOf(link: string): string {
  return new URL(link).searchParams.get('token') ?? ''
}

async function signIn(db: ReturnType<typeof store>, token: string) {
  return handleTokenLogin(
    { token },
    {
      request: SAME_SITE,
      findUserByToken: db.findUserByToken,
      openSession: async (userId) => `payload-token=session-for-${userId}; Path=/; HttpOnly`,
    },
  )
}

describe('the link Korisnici mints opens the session it promises', () => {
  it.each([[['tickets']], [['finance']], [['users']], [['moreska']], [['season_stats']]])(
    'a new %s login signs in with the link it was created with',
    async (permissions) => {
      const db = store()
      const created = await handleCreateUser(
        { username: 'novi', email: 'novi@moreska.eu', permissions },
        createDeps(db),
      )

      expect(created.status).toBe(200)
      const handover = (created.body as { handover: { kind: string; link: string } }).handover
      expect(handover.kind).toBe('link')

      const session = await signIn(db, tokenOf(handover.link))
      expect(session.status).toBe(200)
      expect(session.setCookie).toContain('session-for-1')
    },
  )

  it('hands a door login a password, and that password is what the row keeps', async () => {
    const db = store()
    const created = await handleCreateUser(
      { username: 'vrata', permissions: ['door'] },
      createDeps(db),
    )

    const handover = (created.body as { handover: { kind: string; password: string } }).handover
    expect(handover.kind).toBe('password')
    // The plaintext the screen shows is the one the create wrote, which is what
    // makes "read it out and type it in" work. Payload hashes it on the way in.
    expect(db.users.get('1')?.password).toBe(handover.password)
  })

  it('never hands over a link an account could not use', async () => {
    const db = store()
    const created = await handleCreateUser(
      { username: 'urednik', email: 'urednik@moreska.eu', permissions: ['editor'] },
      createDeps(db),
    )

    // `editor` unlocks no Cecilija screen, so a link would 403 at the session
    // handler. The account gets a password it can sign into the Backoffice with.
    const handover = (created.body as { handover: { kind: string } }).handover
    expect(handover.kind).toBe('password')
  })

  it('refuses a link aimed at an account whose set unlocks nothing', async () => {
    const db = store()
    await handleCreateUser(
      { username: 'urednik2', email: 'urednik2@moreska.eu', permissions: ['editor'] },
      createDeps(db),
    )
    // Mint one by hand, as a stale invitation on the same account would be.
    const token = (await db.issueResetToken({ username: 'urednik2' })) ?? ''

    const session = await signIn(db, token)
    expect(session.status).toBe(403)
    expect(session.body).toEqual({ error: APP_STRINGS.signIn.notAppAccount })
  })

  it('lets Resetiraj lozinku re-open a staff login the same way', async () => {
    const db = store()
    await handleCreateUser(
      { username: 'tatjana', email: 'tatjana@moreska.eu', permissions: ['tickets'] },
      createDeps(db),
    )

    const reset = await handleResetPassword('1', resetDeps(db))
    const handover = (reset.body as { handover: { kind: string; link: string } }).handover
    expect(handover.kind).toBe('link')

    expect((await signIn(db, tokenOf(handover.link))).status).toBe(200)
  })

  it('leaves the older token alive, because Payload keeps only one per account', async () => {
    // A real reset OVERWRITES `reset_password_token` on the row, so an earlier
    // unconsumed invitation stops working the moment a second link is issued
    // for the same account. This store keeps both, which is why the assertion
    // below is about the NEW one: the old one's fate is Payload's, documented
    // in `moreskant-app.md`, and not something this seam can promise.
    const db = store()
    await handleCreateUser(
      { username: 'ana', email: 'ana@moreska.eu', permissions: ['tickets'] },
      createDeps(db),
    )
    const second = await handleResetPassword('1', resetDeps(db))
    const link = (second.body as { handover: { link: string } }).handover.link

    expect((await signIn(db, tokenOf(link))).status).toBe(200)
  })

  it('refuses a shared login even when its link was minted', async () => {
    const db = store()
    await handleCreateUser(
      { username: 'zajednicki', permissions: ['door'], shared: true },
      createDeps(db),
    )
    const token = (await db.issueResetToken({ username: 'zajednicki' })) ?? ''

    const session = await signIn(db, token)
    expect(session.status).toBe(403)
    expect(session.body).toEqual({ error: APP_STRINGS.signIn.sharedAccount })
  })
})
