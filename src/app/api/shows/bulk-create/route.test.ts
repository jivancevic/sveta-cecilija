import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// #441 review — a season entered at once is ONE announcement.
//
// Two halves, and both matter: every `payload.create` carries the opt-out flag
// the Shows hook honours (so the per-row notification never fires), and the
// route sends exactly one summary afterwards, whatever the batch size.

type PayloadArgs = Record<string, unknown>
const create = vi.fn<(args: PayloadArgs) => Promise<{ id: number }>>(async () => ({ id: 1 }))
const find = vi.fn<(args: PayloadArgs) => Promise<{ docs: unknown[] }>>(async () => ({ docs: [] }))
const send = vi.fn(async () => ({ recipients: 2, devices: 3, delivered: 3, dead: 0, failed: 0 }))

vi.mock('@/lib/access/route-guard', () => ({
  requirePermission: vi.fn(async () => ({
    payload: { create, find },
    user: { id: 8 },
    error: null,
  })),
}))
vi.mock('@/lib/push/push-data', () => ({
  createPushDeps: () => ({
    loadMoreskanti: async () => [
      { id: '1', nickname: 'Cici', roles: ['crni'], primaryRole: 'crni', active: true, isMoreskant: true },
      { id: '2', nickname: 'Bepo', roles: ['bili'], primaryRole: 'bili', active: true, isMoreskant: true },
    ],
    loadUserIdsByMember: async (ids: readonly string[]) =>
      new Map(ids.map((id) => [String(id), `u${id}`])),
    send,
  }),
}))

import { POST } from './route'
import { SKIP_ROSTER_PUSH } from '@/lib/push/shows-hook'

const req = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/shows/bulk-create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

// Three Mondays in June 2026: the 1st, the 8th and the 15th.
const BATCH = {
  startDate: '2026-06-01',
  endDate: '2026-06-15',
  daysOfWeek: [1],
  time: '21:00',
  venue: 'ljetno-kino',
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/shows/bulk-create', () => {
  it('writes every show with the roster opt-out set', async () => {
    const res = await POST(req(BATCH))
    const body = (await res.json()) as { created: string[] }

    expect(body.created).toHaveLength(3)
    expect(create).toHaveBeenCalledTimes(3)
    for (const call of create.mock.calls) {
      expect((call[0] as unknown as { context?: Record<string, unknown> }).context).toEqual({
        [SKIP_ROSTER_PUSH]: true,
      })
    }
  })

  it('sends exactly one summary, naming the count and the first date', async () => {
    await POST(req(BATCH))

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    const [userIds, message] = send.mock.calls[0] as unknown as [
      string[],
      { title: string; body: string; url: string },
    ]
    expect(userIds).toEqual(['u1', 'u2'])
    expect(message.title).toBe('Nove izvedbe')
    expect(message.body).toContain('3 novih izvedbi')
    expect(message.body).toContain('ponedjeljak, 1. lipnja')
    // The tap lands on the list: no single performance is what this is about.
    expect(message.url).toBe('/app')
  })

  it('says nothing when every date was already in the schedule', async () => {
    find.mockResolvedValueOnce({
      docs: [
        { date: '2026-06-01T12:00:00.000Z' },
        { date: '2026-06-08T12:00:00.000Z' },
        { date: '2026-06-15T12:00:00.000Z' },
      ],
    } as never)

    const res = await POST(req(BATCH))
    const body = (await res.json()) as { created: string[]; skipped: string[] }

    expect(body.created).toEqual([])
    expect(body.skipped).toHaveLength(3)
    expect(create).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
