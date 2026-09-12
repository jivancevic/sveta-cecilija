import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// #441 review — the bad-weather move (#94) is the other raw-SQL write, and the
// one a dancer most needs to hear about: the evening did not move, the PLACE
// did. The move itself and the buyer emails are mocked; what is tested is the
// push the route now sends.

const moveShowToZimsko = vi.fn(async () => ({ status: 'moved', notified: 5 }))
const pushQuery = vi.fn()
const send = vi.fn(async () => ({ recipients: 1, devices: 1, delivered: 1, dead: 0, failed: 0 }))
const release = vi.fn(async () => {})

vi.mock('@/lib/access/route-guard', () => ({
  requirePermission: vi.fn(async () => ({
    payload: { db: { pool: { query: vi.fn(async () => ({ rows: [] })) } } },
    user: { id: 8, email: 'admin@moreska.eu' },
    error: null,
  })),
}))
vi.mock('@/lib/venue-change', () => ({
  moveShowToZimsko: (...args: unknown[]) => moveShowToZimsko(...(args as [])),
  previewVenueMove: vi.fn(),
}))
vi.mock('@/lib/email/send-venue-change-email', () => ({ sendVenueChangeEmail: vi.fn() }))
vi.mock('@/lib/push/push-data', () => ({
  createPushDeps: () => ({
    query: pushQuery,
    loadAttendance: async () => [{ memberId: '2', status: 'not_coming', army: null }],
    loadMoreskanti: async () => [
      { id: '1', nickname: 'Cici', roles: ['crni'], primaryRole: 'crni', active: true, isMoreskant: true },
      { id: '2', nickname: 'Bepo', roles: ['bili'], primaryRole: 'bili', active: true, isMoreskant: true },
    ],
    loadUserIdsByMember: async (ids: readonly string[]) =>
      new Map(ids.map((id) => [String(id), `u${id}`])),
    loadVoditeljUserIds: async () => ['u9'],
    send,
    release,
  }),
}))

import { POST } from './route'

const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  date: new Date('2026-08-05T12:00:00.000Z'),
  time: '21:00',
  kind: 'redovna',
  is_public: true,
  venue: 'ljetno-kino',
  location: null,
  status: 'active',
  voditelj_note: null,
  updated_at: new Date('2026-07-01T10:00:00.000Z'),
  ...over,
})

const req = () =>
  new NextRequest('http://localhost/api/shows/7/move-to-indoor', { method: 'POST' })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BREVO_API_KEY = 'test-key'
  vi.setSystemTime(new Date('2026-07-20T09:00:00.000Z'))
  pushQuery
    .mockResolvedValueOnce({ rows: [row()] })
    .mockResolvedValueOnce({ rows: [row({ venue: 'zimsko-kino' })] })
})

describe('POST /api/shows/[id]/move-to-indoor', () => {
  it('tells the roster the place changed, leaving out the dancers who are not coming', async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: '7' }) })
    expect(res.status).toBe(200)
    expect(moveShowToZimsko).toHaveBeenCalledTimes(1)

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    const [userIds, message] = send.mock.calls[0] as unknown as [string[], { body: string }]
    // Bepo said "ne dolazim"; the pier is no longer his problem.
    expect(userIds).toEqual(['u1'])
    expect(message.body).toContain('Promijenjeno: mjesto.')
  })

  it('leaves the scheduled claims alone: the evening did not move', async () => {
    await POST(req(), { params: Promise.resolve({ id: '7' }) })
    await vi.waitFor(() => expect(send).toHaveBeenCalled())
    expect(release).not.toHaveBeenCalled()
  })
})
