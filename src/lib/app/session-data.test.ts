import { beforeEach, describe, expect, it, vi } from 'vitest'

// What `openAppSession` must never do (#463, #650).
//
// Minting a session is four Payload helpers and no arithmetic, so there is not
// much here to assert — except the one property that has nothing to do with
// crypto and everything to do with a dancer's phone: the row handed to
// `addSessionToUser` is the RAW user, because that helper appends to
// `user.sessions` and writes the whole document back. A projection would arrive
// with no `sessions` at all and the write would sign every OTHER device out.
//
// That was already true of a sign-in link; #650 makes it true a dozen times a
// season, because the session now slides. A voditelj who renews on their phone
// must not log themselves out of the laptop they left open at the rehearsal.

/** What `addSessionToUser` is handed: the raw row, sessions and all. */
interface SessionArgs {
  user: { id: unknown; sessions?: Array<{ id: string }> }
}

const addSessionToUser = vi.fn(async (_args: SessionArgs) => ({ sid: 'new-sid' }))
const generatePayloadCookie = vi.fn((_args: unknown) => 'payload-token=fresh; Path=/')

vi.mock('payload', () => ({
  createLocalReq: async () => ({ req: true }),
  getFieldsToSign: () => ({ id: 7, sid: 'new-sid' }),
  jwtSign: async () => ({ token: 'fresh', exp: 0 }),
}))

vi.mock('payload/shared', () => ({
  addSessionToUser: (args: SessionArgs) => addSessionToUser(args),
  generatePayloadCookie: (args: unknown) => generatePayloadCookie(args),
}))

const { openAppSession } = await import('./session-data')

/** The two sids of a dancer's other devices, as the raw row carries them. */
const OTHER_DEVICES = [
  { id: 'phone-sid', createdAt: new Date(0), expiresAt: new Date(8.64e12) },
  { id: 'laptop-sid', createdAt: new Date(0), expiresAt: new Date(8.64e12) },
]

function fakePayload() {
  const findOne = vi.fn(async (_args: Record<string, unknown>) => ({
    id: 7,
    email: 'ana@example.com',
    username: 'ana',
    permissions: ['moreskant'],
    sessions: OTHER_DEVICES.map((s) => ({ ...s })),
  }))
  return {
    findOne,
    payload: {
      secret: 'secret',
      config: { cookiePrefix: 'payload' },
      collections: { users: { config: { slug: 'users', auth: { tokenExpiration: 100 } } } },
      db: { findOne },
    },
  }
}

describe('openAppSession', () => {
  beforeEach(() => {
    addSessionToUser.mockClear()
    generatePayloadCookie.mockClear()
  })

  it('hands the RAW row to addSessionToUser, so other devices stay signed in', async () => {
    const { payload } = fakePayload()

    const cookie = await openAppSession(payload as never, 7)

    expect(cookie).toBe('payload-token=fresh; Path=/')
    const call = addSessionToUser.mock.calls[0]?.[0]
    expect(call?.user.id).toBe(7)
    expect(call?.user.sessions?.map((s) => s.id)).toEqual(['phone-sid', 'laptop-sid'])
  })

  it('reads the user without a projection (a projection is what drops sessions)', async () => {
    const { payload, findOne } = fakePayload()

    await openAppSession(payload as never, 7)

    const args = findOne.mock.calls[0]?.[0] ?? {}
    expect(args.collection).toBe('users')
    expect(args.where).toEqual({ id: { equals: 7 } })
    expect('select' in args).toBe(false)
  })

  it('refuses to mint anything for an account that is not there', async () => {
    const { payload, findOne } = fakePayload()
    findOne.mockResolvedValueOnce(null as never)

    await expect(openAppSession(payload as never, 7)).rejects.toThrow('openAppSession: no user 7')
    expect(addSessionToUser).not.toHaveBeenCalled()
  })
})
