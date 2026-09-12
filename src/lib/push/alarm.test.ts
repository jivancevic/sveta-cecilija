import { describe, expect, it, vi } from 'vitest'
import type { AppRequestMeta } from '@/lib/app/request-guard'
import type { AttendanceRow } from '@/lib/attendance/army-count'
import type { AttendanceMember } from '@/lib/attendance/rules'
import { handleManualAlarm, type AlarmPerformance, type ManualAlarmDeps } from './alarm'
import type { PushMessage, SendPushResult } from './send'

// #431 — "Pošalji alarm" through injected deps and a fake sender: who it was
// addressed to, what it said, and what the page is told. The permission gate is
// the route's (`requirePermission(req, 'moreska')`), not this handler's.

const sameOrigin: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function member(id: string, nickname: string, primaryRole: string): AttendanceMember {
  return { id, nickname, roles: [primaryRole], primaryRole, active: true, isMoreskant: true }
}

const roster: AttendanceMember[] = [
  member('1', 'Cici', 'crni'),
  member('2', 'Bepo', 'crni'),
  member('3', 'Grgo', 'bili'),
  member('4', 'Duje', 'bili'),
  member('5', 'Marin', 'crni'),
]

const rows: AttendanceRow[] = [
  { memberId: '1', status: 'coming', army: 'crni' },
  { memberId: '2', status: 'coming', army: 'crni' },
  { memberId: '3', status: 'coming', army: 'bili' },
  { memberId: '4', status: 'not_coming', army: null },
  // Marin (5) has not answered.
]

const performance: AlarmPerformance = {
  id: '10',
  date: '2026-08-05',
  time: '21:00',
  cancelled: false,
  thresholdCrni: 8,
  thresholdBili: 8,
}

/** Six hours before the izvedba begins: the alarm's own hour. */
const NOW = new Date(Date.parse('2026-08-05T13:00:00.000Z'))

const delivered = (n: number): SendPushResult => ({
  recipients: n,
  devices: n,
  delivered: n,
  dead: 0,
  failed: 0,
})

function deps(over: Partial<ManualAlarmDeps> = {}) {
  const send = vi.fn(async () => delivered(2))
  const base: ManualAlarmDeps & { send: typeof send } = {
    request: sameOrigin,
    loadPerformance: vi.fn(async () => performance),
    loadAttendance: async () => rows,
    loadMoreskanti: async () => roster,
    loadUserIdsByMember: async (ids: readonly string[]) =>
      new Map(ids.map((id) => [String(id), `u${id}`] as const)),
    send,
    now: () => NOW,
    ...over,
  } as never
  return base
}

describe('handleManualAlarm', () => {
  it('sends to the no-answer dancers with the current headcount', async () => {
    const d = deps()
    const result = await handleManualAlarm({ performanceId: '10' }, d)

    expect(result.status).toBe(200)
    const [userIds, message] = (d.send as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string[],
      PushMessage,
    ]
    expect(userIds).toEqual(['u5'])
    expect(message.title).toBe('Sokoliću, fali nas!')
    expect(message.body).toContain('1 bilih, 2 crnih')
    expect(message.url).toBe('/app/performances/10')
  })

  it('widens to "ne dolazim" when the box is ticked', async () => {
    const d = deps()
    await handleManualAlarm({ performanceId: '10', includeNotComing: true }, d)

    const [userIds] = (d.send as ReturnType<typeof vi.fn>).mock.calls[0] as [string[]]
    expect([...userIds].sort()).toEqual(['u4', 'u5'])
  })

  it('reports the device count the page shows', async () => {
    const d = deps()
    const result = await handleManualAlarm({ performanceId: '10' }, d)
    expect(result.body).toEqual({ ok: true, devices: 2, delivered: 2, people: 1, dead: 0 })
  })

  it('does not send at all when everybody has answered', async () => {
    const d = deps({
      loadAttendance: async () => [
        ...rows,
        { memberId: '5', status: 'coming', army: 'crni' } as AttendanceRow,
      ],
    })
    const result = await handleManualAlarm({ performanceId: '10' }, d)

    expect(d.send).not.toHaveBeenCalled()
    expect(result.body).toMatchObject({ ok: true, people: 0, delivered: 0 })
  })

  it('reports zero devices when the recipients own no login', async () => {
    const d = deps({ loadUserIdsByMember: async () => new Map() })
    const result = await handleManualAlarm({ performanceId: '10' }, d)

    expect(d.send).not.toHaveBeenCalled()
    // People yes, devices no: the difference the voditelj needs to see.
    expect(result.body).toMatchObject({ people: 1, delivered: 0 })
  })

  it('refuses an alarm for a cancelled performance', async () => {
    const d = deps({ loadPerformance: async () => ({ ...performance, cancelled: true }) })
    const result = await handleManualAlarm({ performanceId: '10' }, d)

    expect(result.status).toBe(400)
    expect(d.send).not.toHaveBeenCalled()
  })

  it('refuses a performance that has already started (#430, story 20)', async () => {
    // Only performances ahead of now ever trigger anything, manual included: a
    // push queued at 21:05 for a 21:00 izvedba asks for an answer nobody can
    // still give.
    const d = deps({ loadPerformance: async () => ({ ...performance, date: '2020-01-01' }) })
    const result = await handleManualAlarm({ performanceId: '10' }, d)

    expect(result.status).toBe(409)
    expect(d.send).not.toHaveBeenCalled()
  })

  it('still sends one minute before the start', async () => {
    const d = deps({ now: () => new Date(Date.parse('2026-08-05T18:59:00.000Z')) })
    const result = await handleManualAlarm({ performanceId: '10' }, d)

    expect(result.status).toBe(200)
    expect(d.send).toHaveBeenCalled()
  })

  it('reads the answers and the roster exactly once per alarm', async () => {
    const loadAttendance = vi.fn(async () => rows)
    const loadMoreskanti = vi.fn(async () => roster)
    const d = deps({ loadAttendance, loadMoreskanti })
    await handleManualAlarm({ performanceId: '10' }, d)

    expect(loadAttendance).toHaveBeenCalledTimes(1)
    expect(loadMoreskanti).toHaveBeenCalledTimes(1)
  })

  it('400s on an unknown or missing performance', async () => {
    expect((await handleManualAlarm({}, deps())).status).toBe(400)
    expect(
      (await handleManualAlarm({ performanceId: '99' }, deps({ loadPerformance: async () => null })))
        .status,
    ).toBe(400)
  })

  it('refuses cross-site (403) and non-JSON (415) before reading anything', async () => {
    const cross = deps({ request: { ...sameOrigin, secFetchSite: 'cross-site' } })
    expect((await handleManualAlarm({ performanceId: '10' }, cross)).status).toBe(403)
    expect(cross.loadPerformance).not.toHaveBeenCalled()

    const form = deps({ request: { ...sameOrigin, contentType: 'text/plain' } })
    expect((await handleManualAlarm({ performanceId: '10' }, form)).status).toBe(415)
  })

  it('has no throttle: two alarms in a row both send', async () => {
    const d = deps()
    await handleManualAlarm({ performanceId: '10' }, d)
    await handleManualAlarm({ performanceId: '10' }, d)
    expect(d.send).toHaveBeenCalledTimes(2)
  })
})
