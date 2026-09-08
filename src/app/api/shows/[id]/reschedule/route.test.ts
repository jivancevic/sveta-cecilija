import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// #441 review — the reschedule writes with raw SQL and no Payload hook fires
// for it, so the roster notification is the ROUTE's job and is tested here.
// Everything the reschedule already did (the claim, the buyer emails, the
// ticket reissue) is mocked away; what is exercised is the before/after read,
// the change push and the release of the alarm/reminder claims — the #440
// defect this route would otherwise still have.

const rescheduleShow = vi.fn(async () => ({ status: 'rescheduled', notified: 3 }))
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
vi.mock('@/lib/show-reschedule', () => ({
  rescheduleShow: (...args: unknown[]) => rescheduleShow(...(args as [])),
  previewReschedule: vi.fn(),
}))
vi.mock('@/lib/email/send-date-change-email', () => ({ sendDateChangeEmail: vi.fn() }))
vi.mock('@/lib/email/send-order-ticket-email', () => ({ sendOrderTicketEmail: vi.fn() }))
vi.mock('@/lib/push/push-data', () => ({
  createPushDeps: () => ({
    query: pushQuery,
    loadAttendance: async () => [],
    loadMoreskanti: async () => [{ id: '1', nickname: 'Cici', roles: ['crni'], primaryRole: 'crni', active: true, isMoreskant: true }],
    loadUserIdsByMember: async () => new Map([['1', 'u1']]),
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

const req = (newDate: string) =>
  new NextRequest('http://localhost/api/shows/7/reschedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newDate }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BREVO_API_KEY = 'test-key'
  vi.setSystemTime(new Date('2026-07-20T09:00:00.000Z'))
  // The row before the claim, then the row after it.
  pushQuery
    .mockResolvedValueOnce({ rows: [row()] })
    .mockResolvedValueOnce({ rows: [row({ date: new Date('2026-08-09T12:00:00.000Z') })] })
})

describe('POST /api/shows/[id]/reschedule', () => {
  it('tells the roster the date moved', async () => {
    const res = await POST(req('2026-08-09'), { params: Promise.resolve({ id: '7' }) })
    expect(res.status).toBe(200)
    expect(rescheduleShow).toHaveBeenCalledTimes(1)

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    const [userIds, message] = send.mock.calls[0] as unknown as [string[], { body: string }]
    expect(userIds).toEqual(['u1'])
    expect(message.body).toContain('Promijenjeno: datum.')
  })

  it('releases the alarm and reminder claims, so the new evening is scheduled again', async () => {
    await POST(req('2026-08-09'), { params: Promise.resolve({ id: '7' }) })

    expect(release.mock.calls.map((c) => c.join(':'))).toEqual(['7:alarm', '7:reminder'])
  })

  it('answers the admin without waiting for the phones', async () => {
    let settled = false
    send.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 25))
      settled = true
      return { recipients: 1, devices: 1, delivered: 1, dead: 0, failed: 0 }
    })

    await POST(req('2026-08-09'), { params: Promise.resolve({ id: '7' }) })
    expect(settled).toBe(false)
    await vi.waitFor(() => expect(settled).toBe(true))
  })
})
