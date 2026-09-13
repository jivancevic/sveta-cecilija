import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The gate in front of the Članovi write routes (#511).
 *
 * Not the business logic — `members-edit.test.ts` owns that — but the
 * chokepoint every staff mutation route carries (CLAUDE.md hard rule): 401
 * without a session, 403 for every set that is not `moreska` (a dancer's own
 * `moreskant` included, because reading the roster is a dancer's and editing
 * somebody's profile is not), and something other than 401/403 once it is.
 *
 * The seam is stubbed at `getRepo()`, which is the whole point of it: no
 * Payload, no database, no `overrideAccess` to reason about. The hook's own
 * refusal is stubbed too, because that is the one answer this screen cannot
 * produce itself and the voditelj still has to read it.
 */

const auth = vi.fn()
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ auth })) }))
vi.mock('@payload-config', () => ({ default: {} }))

const CICI = {
  id: '4',
  name: 'Ivan Marić',
  nickname: 'Ćiro',
  mobile: '0912345678',
  email: null,
  roles: ['crni'],
  primaryRole: 'crni',
  active: true,
  isMoreskant: true,
}

const byId = vi.fn(async (_id: string) => CICI as typeof CICI | null)
const update = vi.fn(async (_id: string, patch: Record<string, unknown>, _ctx: unknown) => ({
  ...CICI,
  ...patch,
}))
const createMoreskant = vi.fn(async (input: Record<string, unknown>, _ctx: unknown) => ({
  ...CICI,
  id: '9',
  ...input,
}))

vi.mock('@/lib/repo', () => ({
  getRepo: () => ({ members: { byId, update, createMoreskant } }),
}))

import { POST } from './route'
import { PATCH } from './[id]/route'

function signIn(permissions: readonly string[] | null) {
  if (permissions === null) auth.mockResolvedValue({ user: null })
  else auth.mockResolvedValue({ user: { id: 1, permissions: [...permissions] } })
}

function request(url: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const NEW_DANCER = { name: 'Pero Perić', nickname: 'Pero', roles: ['crni'], primaryRole: 'crni' }

beforeEach(() => {
  vi.clearAllMocks()
  byId.mockResolvedValue(CICI)
})

describe('the permission gate', () => {
  it('401s an anonymous caller on both routes', async () => {
    signIn(null)
    expect((await POST(request('/api/app/members', 'POST', NEW_DANCER))).status).toBe(401)
    expect(
      (
        await PATCH(request('/api/app/members/4', 'PATCH', { nickname: 'X' }), {
          params: Promise.resolve({ id: '4' }),
        })
      ).status,
    ).toBe(401)
  })

  it('403s a dancer: reading the roster is theirs, editing it is not', async () => {
    signIn(['moreskant'])
    expect((await POST(request('/api/app/members', 'POST', NEW_DANCER))).status).toBe(403)
    expect(
      (
        await PATCH(request('/api/app/members/4', 'PATCH', { nickname: 'X' }), {
          params: Promise.resolve({ id: '4' }),
        })
      ).status,
    ).toBe(403)
    expect(update).not.toHaveBeenCalled()
    expect(createMoreskant).not.toHaveBeenCalled()
  })

  it('403s the blagajna, whose half of a Member is the attribution one', async () => {
    signIn(['tickets'])
    expect((await POST(request('/api/app/members', 'POST', NEW_DANCER))).status).toBe(403)
  })

  it('lets a voditelj through', async () => {
    signIn(['moreska'])
    const res = await PATCH(request('/api/app/members/4', 'PATCH', { nickname: 'Ćiro' }), {
      params: Promise.resolve({ id: '4' }),
    })
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalled()
  })
})

describe('the writes', () => {
  beforeEach(() => signIn(['moreska']))

  it('carries the caller into the write, so the hooks see who edited', async () => {
    await PATCH(request('/api/app/members/4', 'PATCH', { primaryRole: 'crni' }), {
      params: Promise.resolve({ id: '4' }),
    })
    const [, , ctx] = update.mock.calls[0] as unknown as [string, unknown, { user: unknown }]
    expect(ctx.user).toMatchObject({ id: 1 })
  })

  it('creates a dancer flagged as a moreškant', async () => {
    const res = await POST(request('/api/app/members', 'POST', NEW_DANCER))
    expect(res.status).toBe(200)
    const [input] = createMoreskant.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(input.isMoreskant).toBe(true)
    expect(input.name).toBe('Pero Perić')
  })

  it('surfaces the collection hook’s refusal, which is where uniqueness is decided', async () => {
    const { MemberHookError } = await import('@/lib/repo/members')
    update.mockRejectedValueOnce(
      new MemberHookError('Nadimak "Bepo" već koristi drugi moreškant. Nadimci moraju biti jedinstveni.'),
    )
    const res = await PATCH(request('/api/app/members/4', 'PATCH', { nickname: 'Bepo' }), {
      params: Promise.resolve({ id: '4' }),
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Nadimak "Bepo" već koristi drugi moreškant. Nadimci moraju biti jedinstveni.',
    })
  })

  it('404s a Member that is not a moreškant', async () => {
    byId.mockResolvedValueOnce({ ...CICI, isMoreskant: false })
    const res = await PATCH(request('/api/app/members/4', 'PATCH', { nickname: 'X' }), {
      params: Promise.resolve({ id: '4' }),
    })
    expect(res.status).toBe(404)
    expect(update).not.toHaveBeenCalled()
  })
})
