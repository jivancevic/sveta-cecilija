import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The gate in front of the voditelj's four performance routes (#503).
 *
 * Not the business logic — `performance-form.test.ts` owns that — but the
 * chokepoint every staff mutation route carries (CLAUDE.md hard rule): 401
 * without a session, 403 for a set that does not hold `moreska` (a dancer's own
 * `moreskant` included, because writing the schedule is not a dancer's job),
 * and something other than 401/403 once it does.
 *
 * The seam is stubbed at `getRepo()`, which is the whole point of it: no
 * Payload, no database, no `overrideAccess` to reason about.
 */

const auth = vi.fn()
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ auth })) }))
vi.mock('@payload-config', () => ({ default: {} }))

const performanceById = vi.fn()
// Typed parameters, or `mock.calls[0]` is a zero-length tuple and reading the
// rows out of it is a TS2493 that only `tsc` catches (never vitest).
const createPerformances = vi.fn(async (rows: readonly unknown[], _actor?: unknown) => ({
  created: rows.map(() => '2027-05-04'),
}))
const updatePerformance = vi.fn(async (_id: string, _patch: unknown, _actor?: unknown) => {})

vi.mock('@/lib/repo', () => ({
  getRepo: () => ({ shows: { performanceById, createPerformances, updatePerformance } }),
}))

import { POST as createPost } from './route'
import { PATCH as editPatch } from './[id]/route'
import { POST as cancelPost } from './[id]/cancel/route'
import { POST as thresholdsPost } from './[id]/thresholds/route'

const BOOKING = {
  id: '7',
  date: '2027-05-04',
  time: '10:30',
  kind: 'dmc',
  isPublic: false,
  cancelled: false,
  location: 'Luka',
  client: null,
  thresholdCrni: 8,
  thresholdBili: 8,
}

const BODY = {
  date: '2027-05-04',
  time: '10:30',
  kind: 'dmc',
  location: 'Luka',
}

function signIn(permissions: readonly string[] | null) {
  if (permissions === null) auth.mockResolvedValue({ user: null })
  else auth.mockResolvedValue({ user: { id: 1, permissions: [...permissions] } })
}

function request(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
  })
}

const params = Promise.resolve({ id: '7' })

const CALLS = [
  [
    'POST /api/app/performances',
    () => createPost(request('/api/app/performances', 'POST', BODY)),
  ],
  [
    'PATCH /api/app/performances/[id]',
    () => editPatch(request('/api/app/performances/7', 'PATCH', BODY), { params }),
  ],
  [
    'POST /api/app/performances/[id]/cancel',
    () => cancelPost(request('/api/app/performances/7/cancel', 'POST', {}), { params }),
  ],
  [
    'POST /api/app/performances/[id]/thresholds',
    () =>
      thresholdsPost(request('/api/app/performances/7/thresholds', 'POST', { crni: 6, bili: 9 }), {
        params,
      }),
  ],
] as const

beforeEach(() => {
  vi.clearAllMocks()
  performanceById.mockResolvedValue(BOOKING)
  createPerformances.mockResolvedValue({ created: ['2027-05-04'] })
})

describe.each(CALLS)('%s', (_label, call) => {
  it('401s without a session', async () => {
    signIn(null)
    expect((await call()).status).toBe(401)
  })

  it.each([
    ['a dancer', ['moreskant']],
    ['the door', ['door']],
    ['the box office', ['tickets', 'refunds', 'door']],
    ['a partner', ['partner']],
    ['an empty set', []],
  ])('403s for %s', async (_who, permissions) => {
    signIn(permissions)
    expect((await call()).status).toBe(403)
  })

  it('lets a voditelj through the gate', async () => {
    signIn(['moreska', 'moreskant'])
    const res = await call()
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('writes nothing for a caller the gate turned away', async () => {
    signIn(['moreskant'])
    await call()
    expect(createPerformances).not.toHaveBeenCalled()
    expect(updatePerformance).not.toHaveBeenCalled()
  })
})

describe('the voditelj gets past the gate and reaches the seam', () => {
  it('creates through the shared writer', async () => {
    signIn(['moreska'])
    const res = await createPost(request('/api/app/performances', 'POST', BODY))

    expect(res.status).toBe(200)
    expect(createPerformances).toHaveBeenCalledTimes(1)
    expect(createPerformances.mock.calls[0]![0]).toHaveLength(1)
  })

  it('refuses to edit a public performance even though the gate let it in', async () => {
    signIn(['moreska'])
    performanceById.mockResolvedValue({ ...BOOKING, isPublic: true, kind: 'redovna' })

    const res = await editPatch(request('/api/app/performances/7', 'PATCH', BODY), { params })
    expect(res.status).toBe(403)
    expect(updatePerformance).not.toHaveBeenCalled()
  })

  it('still sets the thresholds of a public performance', async () => {
    signIn(['moreska'])
    performanceById.mockResolvedValue({ ...BOOKING, isPublic: true, kind: 'redovna' })

    const res = await thresholdsPost(
      request('/api/app/performances/7/thresholds', 'POST', { crni: 6, bili: 9 }),
      { params },
    )
    expect(res.status).toBe(200)
    expect(updatePerformance).toHaveBeenCalledWith('7', { thresholdCrni: 6, thresholdBili: 9 }, {
      id: 1,
      permissions: ['moreska'],
    })
  })
})
