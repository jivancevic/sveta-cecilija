import { describe, expect, it, vi } from 'vitest'
import type { AttendanceRow } from '@/lib/attendance/army-count'
import type { AttendanceMember } from '@/lib/attendance/rules'
import {
  notifyBulkCreated,
  notifyPerformanceSaved,
  notifyWithdrawal,
  type NotifyDeps,
} from './notify'
import type { PushMessage, SendPushResult } from './send'

// #436 — the two triggered notifications, driven from outside: what a save or an
// answer causes is asserted on the messages a fake sender received and on the
// claims a fake store was asked to release. Nothing here asserts on internal
// calls between the modules.

const AHEAD = Date.UTC(2026, 7, 1, 6, 0)

const SENT: SendPushResult = { recipients: 2, devices: 3, delivered: 3, dead: 0, failed: 0 }

function member(id: string, nickname: string): AttendanceMember {
  return { id, nickname, roles: ['crni'], primaryRole: 'crni', active: true, isMoreskant: true }
}

const roster = [member('1', 'Cici'), member('2', 'Bepo'), member('3', 'Grgo')]

function doc(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    date: '2026-08-05',
    time: '21:00',
    kind: 'redovna',
    isPublic: true,
    venue: 'ljetno-kino',
    status: 'active',
    ...overrides,
  }
}

function deps(overrides: Partial<NotifyDeps> = {}) {
  const sent: { userIds: string[]; message: PushMessage }[] = []
  const released: string[] = []
  const base: NotifyDeps = {
    loadMoreskanti: async () => roster,
    loadAttendance: async () => [] as AttendanceRow[],
    // Everyone but Grgo has a login.
    loadUserIdsByMember: async (ids) =>
      new Map(
        ids.filter((id) => id !== '3').map((id) => [String(id), `u${id}`]),
      ),
    loadVoditeljUserIds: async () => ['u9'],
    send: async (userIds, message) => {
      sent.push({ userIds: [...userIds], message })
      return SENT
    },
    release: async (performanceId, type) => {
      released.push(`${performanceId}:${type}`)
    },
    now: () => new Date(AHEAD),
    ...overrides,
  }
  return { deps: base, sent, released }
}

describe('notifyPerformanceSaved', () => {
  it('tells every moreškant with a login about a new performance', async () => {
    const { deps: d, sent } = deps()
    const outcome = await notifyPerformanceSaved({ doc: doc(), operation: 'create' }, d)
    await outcome.sending

    expect(outcome.kind).toBe('created')
    expect(sent).toHaveLength(1)
    // Grgo has no login, so no device could exist for him.
    expect(sent[0]!.userIds).toEqual(['u1', 'u2'])
    expect(sent[0]!.message.title).toBe('Nova izvedba')
  })

  it('leaves out the dancers who said "ne dolazim" on a change', async () => {
    const rows: AttendanceRow[] = [
      { memberId: '1', status: 'not_coming', army: null },
      { memberId: '2', status: 'coming', army: 'crni' },
    ]
    const { deps: d, sent } = deps({ loadAttendance: async () => rows })

    await (
      await notifyPerformanceSaved(
        { doc: doc({ time: '20:00' }), previousDoc: doc(), operation: 'update' },
        d,
      )
    ).sending

    expect(sent).toHaveLength(1)
    expect(sent[0]!.userIds).toEqual(['u2'])
    expect(sent[0]!.message.body).toContain('Promijenjeno: vrijeme.')
  })

  it('sends nothing when the save changed nothing the roster can see', async () => {
    const { deps: d, sent } = deps()
    const outcome = await notifyPerformanceSaved(
      { doc: doc({ onlineSold: 12 }), previousDoc: doc({ onlineSold: 11 }), operation: 'update' },
      d,
    )
    expect(outcome.kind).toBe('none')
    expect(sent).toEqual([])
  })

  it('releases the alarm and reminder claims when the start moves', async () => {
    const { deps: d, released } = deps()
    const outcome = await notifyPerformanceSaved(
      { doc: doc({ date: '2026-08-09' }), previousDoc: doc(), operation: 'update' },
      d,
    )
    expect(outcome.claimsReleased).toBe(true)
    expect(released).toEqual(['7:alarm', '7:reminder'])
  })

  it('releases them for a moved time too, and leaves them alone otherwise', async () => {
    const moved = deps()
    await notifyPerformanceSaved(
      { doc: doc({ time: '19:00' }), previousDoc: doc(), operation: 'update' },
      moved.deps,
    )
    expect(moved.released).toEqual(['7:alarm', '7:reminder'])

    const noteOnly = deps()
    await notifyPerformanceSaved(
      { doc: doc({ voditeljNote: 'na molu' }), previousDoc: doc(), operation: 'update' },
      noteOnly.deps,
    )
    expect(noteOnly.released).toEqual([])
  })

  it('releases the claims of a performance moved out of the past, and still sends nothing', async () => {
    const { deps: d, sent, released } = deps({ now: () => new Date(Date.UTC(2026, 7, 20)) })
    const outcome = await notifyPerformanceSaved(
      { doc: doc({ date: '2026-08-06' }), previousDoc: doc(), operation: 'update' },
      d,
    )
    expect(outcome.kind).toBe('none')
    expect(sent).toEqual([])
    expect(released).toEqual(['7:alarm', '7:reminder'])
  })

  it('never lets a broken sender fail the save', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps: d } = deps({
      send: async () => {
        throw new Error('push service down')
      },
    })
    const outcome = await notifyPerformanceSaved({ doc: doc(), operation: 'create' }, d)
    // The save is already done; the fan-out swallows its own failure.
    expect(outcome.kind).toBe('created')
    await expect(outcome.sending).resolves.toMatchObject({ delivered: 0 })
    spy.mockRestore()
  })

  it('returns BEFORE the fan-out settles, so a save never waits on FCM', async () => {
    let released = false
    const { deps: d } = deps({
      send: async () => {
        await new Promise((resolve) => setTimeout(resolve, 25))
        released = true
        return SENT
      },
    })
    const outcome = await notifyPerformanceSaved({ doc: doc(), operation: 'create' }, d)
    expect(released).toBe(false)
    await outcome.sending
    expect(released).toBe(true)
  })
})

describe('notifyBulkCreated', () => {
  it('sends ONE message about the whole batch, pointing at the list', async () => {
    const { deps: d, sent } = deps()
    await notifyBulkCreated({ count: 22, firstDate: '2026-05-25' }, d)

    expect(sent).toHaveLength(1)
    expect(sent[0]!.userIds).toEqual(['u1', 'u2'])
    expect(sent[0]!.message.url).toBe('/app')
    expect(`${sent[0]!.message.title} ${sent[0]!.message.body}`).toBe(
      'Nove izvedbe U raspored je dodano 22 novih izvedbi, prva ponedjeljak, 25. svibnja.',
    )
  })

  it('says nothing about an empty batch', async () => {
    const { deps: d, sent } = deps()
    await notifyBulkCreated({ count: 0, firstDate: '2026-05-25' }, d)
    expect(sent).toEqual([])
  })
})

describe('notifyWithdrawal', () => {
  const performance = { id: '7', date: '2026-08-05', time: '21:00' }
  // Two hours before the 21:00 Zagreb start.
  const nowMs = Date.UTC(2026, 7, 5, 17, 0)
  const startMs = Date.UTC(2026, 7, 5, 19, 0)

  function withdrawal(overrides: Record<string, unknown> = {}) {
    return {
      performance,
      who: { memberId: '1', nickname: 'Cici', name: 'Ivan Ivić' },
      previousStatus: 'coming' as const,
      nextStatus: 'not_coming' as const,
      ownAnswer: true,
      startMs,
      nowMs,
      ...overrides,
    }
  }

  it('tells the voditelji who dropped out', async () => {
    const { deps: d, sent } = deps()
    await notifyWithdrawal(withdrawal(), d)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.userIds).toEqual(['u9'])
    expect(`${sent[0]!.message.title} ${sent[0]!.message.body}`).toBe(
      'Netko je odustao Cici više ne dolazi na izvedbu srijeda, 5. kolovoza u 21:00.',
    )
  })

  it('counts a cleared answer as a withdrawal', async () => {
    const { deps: d, sent } = deps()
    await notifyWithdrawal(withdrawal({ nextStatus: null }), d)
    expect(sent).toHaveLength(1)
  })

  it('stays quiet when a voditelj changed somebody else’s answer', async () => {
    const { deps: d, sent } = deps()
    await notifyWithdrawal(withdrawal({ ownAnswer: false }), d)
    expect(sent).toEqual([])
  })

  it('stays quiet more than a day before the performance', async () => {
    const { deps: d, sent } = deps()
    await notifyWithdrawal(withdrawal({ nowMs: startMs - 30 * 60 * 60 * 1000 }), d)
    expect(sent).toEqual([])
  })

  it('stays quiet once the performance has begun', async () => {
    const { deps: d, sent } = deps()
    await notifyWithdrawal(withdrawal({ nowMs: startMs + 1000 }), d)
    expect(sent).toEqual([])
  })

  it('stays quiet for someone who was never coming', async () => {
    const { deps: d, sent } = deps()
    await notifyWithdrawal(withdrawal({ previousStatus: null }), d)
    await notifyWithdrawal(withdrawal({ previousStatus: 'not_coming' }), d)
    expect(sent).toEqual([])
  })

  it('never lets a broken sender fail an answer that is already saved', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps: d } = deps({
      send: async () => {
        throw new Error('push service down')
      },
    })
    await expect(notifyWithdrawal(withdrawal(), d)).resolves.toMatchObject({ delivered: 0 })
    spy.mockRestore()
  })
})
