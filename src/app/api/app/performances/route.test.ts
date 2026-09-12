import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The gate in front of the performance routes (#503, #502).
 *
 * Not the business logic — `performance-form.test.ts` owns that — but the
 * chokepoint every staff mutation route carries (CLAUDE.md hard rule): 401
 * without a session, 403 for a set that holds neither half of Izvedbe (a
 * dancer's own `moreskant` included, because writing the schedule is not a
 * dancer's job), and something other than 401/403 once it does.
 *
 * Three of the five routes are the voditelj's alone; Dodaj and Uredi are
 * shared, because WHICH kind of row a request may touch is a property of the
 * row rather than of the URL (#502). The pause is the blagajna's alone.
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
import { POST as pausePost } from './[id]/pause/route'
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
  venue: null,
  paused: false,
  thresholdCrni: 8,
  thresholdBili: 8,
}

const REDOVNA = {
  ...BOOKING,
  id: '9',
  kind: 'redovna',
  isPublic: true,
  location: null,
  venue: 'ljetno-kino',
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

/** The three the voditelj alone reaches; the gate itself asks for `moreska`. */
const VODITELJ_ONLY = [
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

/** Dodaj and Uredi: either half may knock, and the handler decides on the row. */
const SHARED = [
  ['POST /api/app/performances', () => createPost(request('/api/app/performances', 'POST', BODY))],
  [
    'PATCH /api/app/performances/[id]',
    () => editPatch(request('/api/app/performances/7', 'PATCH', BODY), { params }),
  ],
] as const

/** The pause, which only the blagajna reaches. */
const PAUSE = () =>
  pausePost(request('/api/app/performances/9/pause', 'POST', { paused: true }), {
    params: Promise.resolve({ id: '9' }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  performanceById.mockResolvedValue(BOOKING)
  createPerformances.mockResolvedValue({ created: ['2027-05-04'] })
})

describe.each([...VODITELJ_ONLY, ...SHARED])('%s', (_label, call) => {
  it('401s without a session', async () => {
    signIn(null)
    expect((await call()).status).toBe(401)
  })

  it.each([
    ['a dancer', ['moreskant']],
    ['the door', ['door']],
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

describe.each(VODITELJ_ONLY)('%s is the voditelj’s alone', (_label, call) => {
  it('403s for the box office at the gate itself', async () => {
    signIn(['tickets', 'refunds', 'door'])
    expect((await call()).status).toBe(403)
  })
})

describe('POST /api/app/performances/[id]/pause', () => {
  it('401s without a session', async () => {
    signIn(null)
    expect((await PAUSE()).status).toBe(401)
  })

  it.each([
    ['a voditelj', ['moreska']],
    ['a dancer', ['moreskant']],
    ['the door', ['door']],
  ])('403s for %s: a public evening’s sale is the blagajna’s', async (_who, permissions) => {
    signIn(permissions)
    expect((await PAUSE()).status).toBe(403)
    expect(updatePerformance).not.toHaveBeenCalled()
  })

  it('lets the box office flip it, through the seam', async () => {
    signIn(['tickets'])
    performanceById.mockResolvedValue(REDOVNA)

    const res = await PAUSE()
    expect(res.status).toBe(200)
    expect(updatePerformance).toHaveBeenCalledWith('9', { onlineSalesPaused: true }, {
      id: 1,
      permissions: ['tickets'],
    })
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
    performanceById.mockResolvedValue(REDOVNA)

    const res = await editPatch(request('/api/app/performances/7', 'PATCH', BODY), { params })
    expect(res.status).toBe(403)
    expect(updatePerformance).not.toHaveBeenCalled()
  })

  it('still sets the thresholds of a public performance', async () => {
    signIn(['moreska'])
    performanceById.mockResolvedValue(REDOVNA)

    const res = await thresholdsPost(
      request('/api/app/performances/7/thresholds', 'POST', { crni: 6, bili: 9 }),
      { params },
    )
    expect(res.status).toBe(200)
    // The id written is the stored row's, not the one in the URL.
    expect(updatePerformance).toHaveBeenCalledWith('9', { thresholdCrni: 6, thresholdBili: 9 }, {
      id: 1,
      permissions: ['moreska'],
    })
  })
})

describe('the box office gets past the gate and reaches the seam (#502)', () => {
  it('creates a PUBLIC performance through the same shared writer', async () => {
    signIn(['tickets'])
    const res = await createPost(
      request('/api/app/performances', 'POST', {
        date: '2027-07-19',
        time: '21:00',
        kind: 'redovna',
        venue: 'ljetno-kino',
        isPublic: true,
      }),
    )

    expect(res.status).toBe(200)
    expect(createPerformances.mock.calls[0]![0]).toHaveLength(1)
  })

  it('refuses them a booking, which is the voditelj’s row', async () => {
    signIn(['tickets'])
    const res = await createPost(request('/api/app/performances', 'POST', BODY))

    expect(res.status).toBe(403)
    expect(createPerformances).not.toHaveBeenCalled()
  })

  it('edits the hour, the house and the kind of a public evening', async () => {
    signIn(['tickets'])
    performanceById.mockResolvedValue(REDOVNA)

    const res = await editPatch(
      request('/api/app/performances/9', 'PATCH', {
        time: '21:30',
        kind: 'redovna',
        venue: 'zimsko-kino',
      }),
      { params: Promise.resolve({ id: '9' }) },
    )

    expect(res.status).toBe(200)
    expect(updatePerformance).toHaveBeenCalledWith(
      '9',
      { time: '21:30', kind: 'redovna', venue: 'zimsko-kino' },
      { id: 1, permissions: ['tickets'] },
    )
  })
})
