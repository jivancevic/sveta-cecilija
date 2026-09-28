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
// The route's own pool, for the paths that read the show themselves rather than
// through the (mocked) seam: the test send is the only one (#688).
const poolQuery = vi.fn(async () => ({ rows: [] as Record<string, unknown>[] }))
// Typed params, not `async () => true`: an untyped vi.fn makes every indexed
// argument `never` and the assertions below fail `tsc` while vitest stays green.
const sendScheduleChangeEmail = vi.fn(
  async (_input: { locale: string; show: Record<string, unknown> }) => true,
)
const send = vi.fn(async () => ({ recipients: 1, devices: 1, delivered: 1, dead: 0, failed: 0 }))
const release = vi.fn(async () => {})

vi.mock('@/lib/access/route-guard', () => ({
  requirePermission: vi.fn(async () => ({
    payload: { db: { pool: { query: poolQuery } } },
    user: { id: 8, email: 'admin@moreska.eu' },
    error: null,
  })),
}))
vi.mock('@/lib/show-reschedule', () => ({
  rescheduleShow: (...args: unknown[]) => rescheduleShow(...(args as [])),
  previewReschedule: vi.fn(),
}))
vi.mock('@/lib/email/send-schedule-change-email', () => ({
  sendScheduleChangeEmail: (input: unknown) =>
    sendScheduleChangeEmail(input as { locale: string; show: Record<string, unknown> }),
}))
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

const post = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/shows/7/reschedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const req = (newDate: string) => post({ newDate })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BREVO_API_KEY = 'test-key'
  vi.setSystemTime(new Date('2026-07-20T09:00:00.000Z'))
  // The route's own SELECT, for the test-send path: 05.08. at 21:00, public.
  poolQuery.mockResolvedValue({ rows: [row()] })
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

  // #688 — the hour takes the same path as the day, so the route has to accept
  // it, hand it to the seam, and still tell the roster.
  it('accepts a time-only move and passes it through', async () => {
    pushQuery.mockReset()
    pushQuery
      .mockResolvedValueOnce({ rows: [row()] })
      .mockResolvedValueOnce({ rows: [row({ time: '18:00' })] })

    const res = await POST(post({ newTime: '18:00' }), { params: Promise.resolve({ id: '7' }) })

    expect(res.status).toBe(200)
    expect(rescheduleShow).toHaveBeenCalledWith(
      { showId: '7', userId: '8', newDate: undefined, newTime: '18:00' },
      expect.anything(),
    )
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    const [, message] = send.mock.calls[0] as unknown as [string[], { body: string }]
    expect(message.body).toContain('Promijenjeno: vrijeme.')
  })

  it('carries both halves at once', async () => {
    await POST(post({ newDate: '2026-08-09', newTime: '18:00' }), {
      params: Promise.resolve({ id: '7' }),
    })
    expect(rescheduleShow).toHaveBeenCalledWith(
      { showId: '7', userId: '8', newDate: '2026-08-09', newTime: '18:00' },
      expect.anything(),
    )
  })

  it('refuses a body that moves nothing, rather than quietly doing nothing', async () => {
    const res = await POST(post({}), { params: Promise.resolve({ id: '7' }) })
    expect(res.status).toBe(400)
    expect(rescheduleShow).not.toHaveBeenCalled()
  })

  // The test send is the only rehearsal for an action that mails every buyer, so
  // it has to preview the REAL shape — and refuse to preview a change nobody
  // made, which would render a "new start time" notice with the same hour on
  // both sides (#688).
  it('previews a time-only change in both locales without writing', async () => {
    const res = await POST(post({ newTime: '18:00', test: true }), {
      params: Promise.resolve({ id: '7' }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'test-sent', to: 'admin@moreska.eu' })
    expect(sendScheduleChangeEmail).toHaveBeenCalledTimes(2)
    const locales = sendScheduleChangeEmail.mock.calls.map((c) => c[0].locale)
    expect(locales).toEqual(['en', 'hr'])
    // The unchanged half is the show's own, so the notice reads as a time move.
    expect(sendScheduleChangeEmail.mock.calls[0]![0].show).toEqual({
      oldDate: '2026-08-05',
      newDate: '2026-08-05',
      oldTime: '21:00',
      newTime: '18:00',
      venue: 'ljetno-kino',
    })
    // A preview writes nothing and moves nothing.
    expect(rescheduleShow).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses to preview a schedule that is already the show’s', async () => {
    const res = await POST(post({ newTime: '21:00', test: true }), {
      params: Promise.resolve({ id: '7' }),
    })

    expect(res.status).toBe(400)
    expect(sendScheduleChangeEmail).not.toHaveBeenCalled()
  })

  it('refuses a time that is not HH:MM', async () => {
    const res = await POST(post({ newTime: '18h' }), { params: Promise.resolve({ id: '7' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'newTime must be HH:MM' })
    expect(rescheduleShow).not.toHaveBeenCalled()
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
