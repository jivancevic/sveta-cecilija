import { describe, expect, it, vi } from 'vitest'
import type { AttendanceRow } from '@/lib/attendance/army-count'
import type { AttendanceMember } from '@/lib/attendance/rules'
import { showStartMs } from '@/lib/show-time'
import {
  runRosterNotifications,
  type DuePerformance,
  type RosterNotificationDeps,
} from './roster-notifications'
import { ALARM_LEAD_MS, REMINDER_LEAD_MS } from './schedule'
import type { PushMessage, SendPushResult } from './send'

// #435 — the cron run over a FAKE CLOCK and a FAKE POSTER: what the two jobs
// send, to whom, and the once-per-performance claim under a double run.

function member(id: string, primaryRole: string): AttendanceMember {
  return {
    id,
    nickname: `M${id}`,
    roles: [primaryRole],
    primaryRole,
    active: true,
    isMoreskant: true,
  }
}

const roster: AttendanceMember[] = [
  member('1', 'crni'),
  member('2', 'crni'),
  member('3', 'bili'),
  member('4', 'bili'),
]

/** Two crni coming, one bili coming, nobody else has answered. */
const answered: AttendanceRow[] = [
  { memberId: '1', status: 'coming', army: 'crni' },
  { memberId: '2', status: 'coming', army: 'crni' },
  { memberId: '3', status: 'coming', army: 'bili' },
]

const performance: DuePerformance = {
  id: '10',
  date: '2026-08-05',
  time: '21:00',
  cancelled: false,
  thresholdCrni: 2,
  thresholdBili: 2, // one short: the alarm has a reason
}

const START = showStartMs(performance.date, performance.time)

const sent = (n: number): SendPushResult => ({
  recipients: n,
  devices: n,
  delivered: n,
  dead: 0,
  failed: 0,
})

/** A store that remembers its claims, the way the unique index does. */
function claims() {
  const taken = new Set<string>()
  return {
    taken,
    claim: vi.fn(async (id: string, type: string) => {
      const key = `${id}:${type}`
      if (taken.has(key)) return false
      taken.add(key)
      return true
    }),
    release: vi.fn(async (id: string, type: string) => {
      taken.delete(`${id}:${type}`)
    }),
  }
}

function deps(over: Partial<RosterNotificationDeps> = {}) {
  const c = claims()
  const send = vi.fn(async () => sent(1))
  const d: RosterNotificationDeps & { send: typeof send; taken: Set<string> } = {
    loadDuePerformances: async () => [performance],
    loadAttendance: async () => answered,
    loadMoreskanti: async () => roster,
    loadUserIdsByMember: async (ids: readonly string[]) =>
      new Map(ids.map((id) => [String(id), `u${id}`] as const)),
    send,
    claim: c.claim,
    release: c.release,
    finalize: vi.fn(async () => {}),
    now: () => new Date(START - ALARM_LEAD_MS),
    taken: c.taken,
    ...over,
  } as never
  return d
}

function messagesOf(send: ReturnType<typeof vi.fn>): PushMessage[] {
  return send.mock.calls.map((call) => call[1] as PushMessage)
}

describe('the automatic alarm', () => {
  it('sends to the no-answer dancers once the alarm window opens', async () => {
    const d = deps()
    const summary = await runRosterNotifications(d)

    expect(d.send).toHaveBeenCalledTimes(1)
    const [userIds, message] = (d.send as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string[],
      PushMessage,
    ]
    expect(userIds).toEqual(['u4'])
    expect(message.body).toContain('1 bilih, 2 crnih')
    expect(summary.alarm).toMatchObject({ due: 1, claimed: 1, sent: 1, skipped: 0, devices: 1 })
  })

  it('sends nothing before the window opens', async () => {
    const d = deps({ now: () => new Date(START - ALARM_LEAD_MS - 60_000) })
    const summary = await runRosterNotifications(d)

    expect(d.send).not.toHaveBeenCalled()
    expect(summary.alarm.due).toBe(0)
    expect(d.claim).not.toHaveBeenCalled()
  })

  it('sends nothing once the performance has started (story 20)', async () => {
    const d = deps({ now: () => new Date(START + 1000) })
    await runRosterNotifications(d)
    expect(d.send).not.toHaveBeenCalled()
  })

  it('is CLAIMED even when it is skipped because no army is short', async () => {
    // Both thresholds met: nothing is sent, but the slot is taken so a late
    // withdrawal cannot ring everyone at midnight.
    const d = deps({ loadDuePerformances: async () => [{ ...performance, thresholdBili: 1 }] })
    const summary = await runRosterNotifications(d)

    expect(d.send).not.toHaveBeenCalled()
    expect(d.claim).toHaveBeenCalledWith('10', 'alarm')
    expect(summary.alarm).toMatchObject({ claimed: 1, sent: 0, skipped: 1 })
  })

  it('a second run in the same window sends nothing (the claim)', async () => {
    const d = deps()
    await runRosterNotifications(d)
    const second = await runRosterNotifications(d)

    expect(d.send).toHaveBeenCalledTimes(1)
    expect(second.alarm).toMatchObject({ due: 1, claimed: 0, sent: 0 })
  })

  it('releases the claim when the send throws, so the next run can redo it', async () => {
    const boom = vi.fn(async () => {
      throw new Error('push service down')
    })
    const d = deps({ send: boom as never })
    const summary = await runRosterNotifications(d)

    expect(summary.errors).toBe(1)
    expect(d.release).toHaveBeenCalledWith('10', 'alarm')
    expect(d.taken.has('10:alarm')).toBe(false)
  })

  it('keeps the claim when the alarm simply reached nobody', async () => {
    // A no-answer dancer without a login is not a failure to retry.
    const d = deps({ loadUserIdsByMember: async () => new Map() })
    const summary = await runRosterNotifications(d)

    expect(d.release).not.toHaveBeenCalled()
    expect(summary.alarm).toMatchObject({ claimed: 1, sent: 0, skipped: 1 })
  })

  it('opens the evening before for a morning performance', async () => {
    const morning = { ...performance, time: '09:30' }
    const before = deps({
      loadDuePerformances: async () => [morning],
      now: () => new Date(Date.parse('2026-08-04T15:59:00.000Z')),
    })
    await runRosterNotifications(before)
    expect(before.send).not.toHaveBeenCalled()

    const after = deps({
      loadDuePerformances: async () => [morning],
      now: () => new Date(Date.parse('2026-08-04T16:00:00.000Z')),
    })
    await runRosterNotifications(after)
    expect(after.send).toHaveBeenCalledTimes(1)
  })
})

describe('the T-48h reminder', () => {
  const at48h = () => new Date(START - REMINDER_LEAD_MS)

  it('goes to the no-answer dancers only', async () => {
    const d = deps({ now: at48h })
    const summary = await runRosterNotifications(d)

    const [userIds, message] = (d.send as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string[],
      PushMessage,
    ]
    expect(userIds).toEqual(['u4'])
    expect(message.title).toBe('Javi dolazak')
    expect(summary.reminder).toMatchObject({ due: 1, claimed: 1, sent: 1 })
    // The alarm window is nowhere near open yet.
    expect(summary.alarm.due).toBe(0)
  })

  it('sends nothing when everybody has answered', async () => {
    const d = deps({
      now: at48h,
      loadAttendance: async () => [
        ...answered,
        { memberId: '4', status: 'not_coming', army: null } as AttendanceRow,
      ],
    })
    const summary = await runRosterNotifications(d)

    expect(d.send).not.toHaveBeenCalled()
    expect(summary.reminder).toMatchObject({ claimed: 1, sent: 0, skipped: 1 })
  })

  it('is not due a minute early and only once', async () => {
    const early = deps({ now: () => new Date(START - REMINDER_LEAD_MS - 60_000) })
    await runRosterNotifications(early)
    expect(early.send).not.toHaveBeenCalled()

    const d = deps({ now: at48h })
    await runRosterNotifications(d)
    await runRosterNotifications(d)
    expect(d.send).toHaveBeenCalledTimes(1)
  })

  it('is a different claim from the alarm, so both fire in their own window', async () => {
    const d = deps({ now: at48h })
    await runRosterNotifications(d)
    expect(messagesOf(d.send as ReturnType<typeof vi.fn>)[0]?.title).toBe('Javi dolazak')

    // The SAME claim table, its own fresh sender, clock moved to the alarm
    // window: the reminder's claim does not block the alarm's.
    const later = deps({
      now: () => new Date(START - ALARM_LEAD_MS),
      claim: d.claim,
      release: d.release,
    })
    await runRosterNotifications(later)

    expect(messagesOf(later.send as ReturnType<typeof vi.fn>)[0]?.title).toBe(
      'Sokoliću, fali nas!',
    )
  })
})

describe('the run as a whole', () => {
  it('one broken performance does not stop the others', async () => {
    const other: DuePerformance = { ...performance, id: '11' }
    const d = deps({
      loadDuePerformances: async () => [performance, other],
      send: vi.fn(async (userIds: readonly string[], message: PushMessage) => {
        if (message.url.endsWith('/10')) throw new Error('boom')
        return sent(1)
      }) as never,
    })
    const summary = await runRosterNotifications(d)

    expect(summary.errors).toBe(1)
    expect(summary.alarm.sent).toBe(1)
    expect(summary.performances).toBe(2)
  })

  it('reports an empty run honestly', async () => {
    const d = deps({ loadDuePerformances: async () => [] })
    const summary = await runRosterNotifications(d)

    expect(summary).toMatchObject({ performances: 0, errors: 0 })
    expect(summary.alarm.due).toBe(0)
    expect(summary.reminder.due).toBe(0)
  })
})
