import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The gate in front of the six Korisnici routes (#510, #563).
 *
 * This file matters more than the usual route test, because on this screen the
 * route IS the lock. `Users.permissions`, `Users.shared` and `Users.member` are
 * field-locked to a `users` holder, and the seam writes with `overrideAccess:
 * true`, which turns field access off. So a missing `requirePermission` here
 * would not fail loudly: Payload would drop the denied field and answer **200**
 * with nothing changed — or, on these routes, write it. The assertions below
 * are that the check is there on all six, and that no other permission in the
 * vocabulary gets past it.
 *
 * The business rules are elsewhere and unit-tested there: `users-admin.test.ts`
 * (the permission diff, the self-lockout, the shared-self refusal, the e-mail
 * rule), `users-account.test.ts` (the create and the two handovers),
 * `users-link.test.ts` (`taken` and `not-active`), `users-tabs.test.ts` (the
 * bar: the self refusal, the locked screen, the three-key cap). What is here is the gate,
 * plus the 200 and 409 that prove the wiring reaches the rules at all.
 *
 * The seam is stubbed at `getRepo()`, which is the whole point of it: no
 * Payload, no database, no `overrideAccess` to reason about.
 */

const auth = vi.fn()
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ auth })) }))
vi.mock('@payload-config', () => ({ default: {} }))

// Typed rather than inferred: `email: null` alone narrows the field to `null`,
// and the one test that gives the account an address is then a TS2322 only
// `tsc` catches (never vitest).
const ACCOUNT: {
  id: string
  username: string | null
  name: string | null
  email: string | null
  permissions: string[]
  shared: boolean
  tabs: string[]
  partnerId: string | null
  partnerName: string | null
  memberId: string | null
  memberName: string | null
} = {
  id: '7',
  username: 'tehnika',
  name: null,
  email: null,
  permissions: ['door'],
  shared: true,
  tabs: [],
  partnerId: null,
  partnerName: null,
  memberId: null,
  memberName: null,
}

const byId = vi.fn(async (_id: string) => ACCOUNT as typeof ACCOUNT | null)
const updatePermissions = vi.fn(async (_id: string, _p: readonly string[], _ctx?: unknown) => {})
const setShared = vi.fn(async (_id: string, _shared: boolean, _ctx?: unknown) => {})
const setTabs = vi.fn(async (_id: string, _tabs: readonly string[], _ctx?: unknown) => {})
const setPassword = vi.fn(async (_id: string, _password: string, _ctx?: unknown) => {})
const linkMember = vi.fn(async (_id: string, _memberId: string | null, _ctx?: unknown) => {})
const linkPartner = vi.fn(async (_id: string, _partnerId: string | null, _ctx?: unknown) => {})
const create = vi.fn(async (data: { username: string }, _ctx?: unknown) => ({
  id: '42',
  username: data.username,
}))
const usernameTaken = vi.fn(async (_username: string) => false)
const emailTaken = vi.fn(async (_email: string) => false)
const issueResetToken = vi.fn(async (_t: unknown, _ms: number) => 'tok123' as string | null)
const memberById = vi.fn(async (_id: string) => ({
  id: '18',
  name: 'Luka Brkić',
  isMoreskant: true,
  active: true,
  roles: [],
}))
const userIdsByMember = vi.fn(async (_id: string) => [] as string[])
const partnerById = vi.fn(async (_id: string | number) => ({
  id: '3',
  name: 'Kaleta',
  active: true,
  commissionPercent: 10,
}) as { id: string; name: string; active: boolean; commissionPercent: number } | null)

vi.mock('@/lib/repo', () => ({
  getRepo: () => ({
    users: {
      byId,
      updatePermissions,
      setShared,
      setTabs,
      setPassword,
      linkMember,
      linkPartner,
      create,
      usernameTaken,
      emailTaken,
      issueResetToken,
      memberById,
      userIdsByMember,
    },
    partners: { byId: partnerById },
  }),
}))

import { POST as createPost } from './route'
import { PATCH as permissionsPatch } from './[id]/permissions/route'
import { POST as sharedPost } from './[id]/shared/route'
import { POST as resetPost } from './[id]/reset-password/route'
import { POST as linkPost } from './[id]/link/route'
import { PATCH as tabsPatch } from './[id]/tabs/route'

function signIn(permissions: readonly string[] | null, over: Record<string, unknown> = {}) {
  if (permissions === null) auth.mockResolvedValue({ user: null })
  else auth.mockResolvedValue({ user: { id: 1, permissions: [...permissions], ...over } })
}

function request(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
  })
}

const params = Promise.resolve({ id: '7' })

const ROUTES = [
  [
    'POST /api/app/users',
    () =>
      createPost(
        request('/api/app/users', 'POST', { username: 'novi', permissions: ['door'] }),
      ),
  ],
  [
    'PATCH /api/app/users/[id]/permissions',
    () =>
      permissionsPatch(
        request('/api/app/users/7/permissions', 'PATCH', { permissions: ['door'] }),
        { params },
      ),
  ],
  [
    'POST /api/app/users/[id]/shared',
    () => sharedPost(request('/api/app/users/7/shared', 'POST', { shared: false }), { params }),
  ],
  [
    'POST /api/app/users/[id]/reset-password',
    () => resetPost(request('/api/app/users/7/reset-password', 'POST', {}), { params }),
  ],
  [
    'POST /api/app/users/[id]/link',
    () => linkPost(request('/api/app/users/7/link', 'POST', { member: '18' }), { params }),
  ],
  [
    'PATCH /api/app/users/[id]/tabs',
    () =>
      tabsPatch(request('/api/app/users/7/tabs', 'PATCH', { tabs: ['scan'] }), { params }),
  ],
] as const

beforeEach(() => {
  vi.clearAllMocks()
  // The sign-in link is built against the configured origin, and a relative one
  // is refused on purpose (`isUsableBaseUrl`), so the branch needs one set.
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost')
  byId.mockResolvedValue(ACCOUNT)
  usernameTaken.mockResolvedValue(false)
  emailTaken.mockResolvedValue(false)
  issueResetToken.mockResolvedValue('tok123')
  userIdsByMember.mockResolvedValue([])
})

describe.each(ROUTES)('%s', (_label, call) => {
  it('401s without a session', async () => {
    signIn(null)
    expect((await call()).status).toBe(401)
  })

  it.each([
    ['tickets'],
    ['refunds'],
    ['door'],
    ['moreska'],
    ['moreskant'],
    ['partner'],
    ['season_stats'],
    ['finance'],
    ['editor'],
    ['dev'],
  ])('403s a caller holding only `%s`', async (permission) => {
    signIn([permission])
    expect((await call()).status).toBe(403)
  })

  it('lets a `users` holder through', async () => {
    signIn(['users'])
    expect((await call()).status).toBe(200)
  })

  // ADR-0022, widened by the #510 review: the shared `tehnika` password is on a
  // wall, so a shared login administers no account even holding `users`.
  it('403s a shared caller that holds `users`', async () => {
    signIn(['users'], { shared: true })
    expect((await call()).status).toBe(403)
  })

  it('writes nothing when the gate refuses', async () => {
    signIn(['tickets'])
    await call()
    for (const write of [
      updatePermissions,
      setShared,
      setTabs,
      setPassword,
      linkMember,
      linkPartner,
      create,
    ]) {
      expect(write).not.toHaveBeenCalled()
    }
  })
})

describe('the rules are reached, not re-implemented in the route', () => {
  it('409s the caller taking `users` off their own account', async () => {
    signIn(['users'])
    byId.mockResolvedValue({ ...ACCOUNT, id: '1', shared: false, permissions: ['users'] })
    const res = await permissionsPatch(
      request('/api/app/users/1/permissions', 'PATCH', { permissions: ['tickets'] }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(409)
    expect(updatePermissions).not.toHaveBeenCalled()
  })

  it('400s a named-person set on an account with no address', async () => {
    signIn(['users'])
    const res = await permissionsPatch(
      request('/api/app/users/7/permissions', 'PATCH', { permissions: ['tickets'] }),
      { params },
    )
    expect(res.status).toBe(400)
  })

  it('lets the caller arrange their own bar (#591)', async () => {
    signIn(['users'])
    byId.mockResolvedValue({ ...ACCOUNT, id: '1', shared: false, permissions: ['users'] })
    const res = await tabsPatch(request('/api/app/users/1/tabs', 'PATCH', { tabs: ['users'] }), {
      params: Promise.resolve({ id: '1' }),
    })
    expect(res.status).toBe(200)
    expect(setTabs).toHaveBeenCalled()
  })

  it('400s a tab the target account does not unlock (#563)', async () => {
    signIn(['users'])
    // The account holds `door` and nothing else: Financije is not its to carry.
    const res = await tabsPatch(request('/api/app/users/7/tabs', 'PATCH', { tabs: ['finance'] }), {
      params,
    })
    expect(res.status).toBe(400)
    expect(setTabs).not.toHaveBeenCalled()
  })

  it('409s a Member another login already signs in as', async () => {
    signIn(['users'])
    userIdsByMember.mockResolvedValue(['12'])
    const res = await linkPost(request('/api/app/users/7/link', 'POST', { member: '18' }), {
      params,
    })
    expect(res.status).toBe(409)
    expect(linkMember).not.toHaveBeenCalled()
  })

  it('hands an address-less login a password and never logs it', async () => {
    signIn(['users'])
    const res = await resetPost(request('/api/app/users/7/reset-password', 'POST', {}), { params })
    const body = (await res.json()) as { handover: { kind: string; password: string } }

    expect(body.handover.kind).toBe('password')
    // The plaintext reaches the caller and the hasher, and nowhere else.
    expect(setPassword).toHaveBeenCalledWith('7', body.handover.password, expect.anything())
  })

  it('mints a sign-in link for an account that has an address', async () => {
    signIn(['users'])
    byId.mockResolvedValue({ ...ACCOUNT, email: 'tatjana@moreska.eu', username: 'ttvigna' })
    const res = await resetPost(request('/api/app/users/7/reset-password', 'POST', {}), { params })
    const body = (await res.json()) as { handover: { kind: string; link: string } }

    expect(body.handover.kind).toBe('link')
    expect(body.handover.link).toContain('/app/session?token=tok123')
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('400s a link aimed at a deactivated partner', async () => {
    signIn(['users'])
    partnerById.mockResolvedValue({ id: '3', name: 'Kaleta', active: false, commissionPercent: 10 })
    const res = await linkPost(request('/api/app/users/7/link', 'POST', { partner: '3' }), {
      params,
    })
    expect(res.status).toBe(400)
    expect(linkPartner).not.toHaveBeenCalled()
  })

  it('403s a cross-site request even from a `users` holder', async () => {
    signIn(['users'])
    const req = new NextRequest('http://localhost/api/app/users/7/shared', {
      method: 'POST',
      body: JSON.stringify({ shared: false }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    })
    expect((await sharedPost(req, { params })).status).toBe(403)
    expect(setShared).not.toHaveBeenCalled()
  })
})
