import { describe, expect, it, vi } from 'vitest'
import { handleLineupConfirm, handleLineupReplace, type LineupPerformance } from './replace'
import { LINEUP_ERRORS } from './rules'
import { APP_STRINGS } from '@/lib/app/strings'
import type { AppRequestMeta } from '@/lib/app/request-guard'
import type { AttendanceMember } from '@/lib/attendance/rules'

// #432 — the two writers, driven through the handler with fakes: the status
// code and body out, and the rows the store was asked to write. The 401/403
// permission gate is `requirePermission`'s and is tested in
// `route-guard.test.ts`; what is testable here is the cross-site guard, the
// validation, the 409 and the replace itself.

const sameSite: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const member = (id: string, nickname: string, roles: string[]): AttendanceMember => ({
  id,
  nickname,
  roles,
  primaryRole: roles[0] ?? null,
  active: true,
  isMoreskant: true,
})

const roster = [
  member('1', 'Cici', ['crni', 'crni_kralj']),
  member('2', 'Dado', ['bili']),
]

function deps(over: Partial<Parameters<typeof handleLineupReplace>[1]> = {}) {
  const replaceEntries = vi.fn().mockResolvedValue(undefined)
  return {
    replaceEntries,
    all: {
      request: sameSite,
      loadPerformance: async (id: string): Promise<LineupPerformance | null> =>
        id === '10' ? { id: '10', confirmed: false } : null,
      loadRoster: async () => roster,
      replaceEntries,
      ...over,
    },
  }
}

describe('handleLineupReplace', () => {
  it('writes the validated entries and answers with them plus the warnings', async () => {
    const { all, replaceEntries } = deps()
    const result = await handleLineupReplace(
      {
        performanceId: '10',
        entries: [
          { memberId: '1', role: 'crni_kralj' },
          // Dado has no bula role: a warning, and it still saves (story 29).
          { memberId: '2', role: 'bula' },
        ],
      },
      all,
    )

    expect(result.status).toBe(200)
    expect(replaceEntries).toHaveBeenCalledWith('10', [
      { memberId: '1', role: 'crni_kralj' },
      { memberId: '2', role: 'bula' },
    ])
    const body = result.body as { ok: true; entries: unknown[]; warnings: { memberId: string }[] }
    expect(body.ok).toBe(true)
    expect(body.warnings.map((w) => w.memberId)).toEqual(['2'])
  })

  it('clears a lineup when handed an empty list', async () => {
    const { all, replaceEntries } = deps()
    const result = await handleLineupReplace({ performanceId: '10', entries: [] }, all)
    expect(result.status).toBe(200)
    expect(replaceEntries).toHaveBeenCalledWith('10', [])
  })

  // Story 31: Potvrdi is the promise that the list cannot change by accident.
  it('refuses a confirmed lineup with 409 and writes nothing', async () => {
    const { all, replaceEntries } = deps({
      loadPerformance: async () => ({ id: '10', confirmed: true }),
    })
    const result = await handleLineupReplace(
      { performanceId: '10', entries: [{ memberId: '1', role: 'crni' }] },
      all,
    )
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.locked })
    expect(replaceEntries).not.toHaveBeenCalled()
  })

  it('400s an unknown performance', async () => {
    const { all, replaceEntries } = deps()
    const result = await handleLineupReplace({ performanceId: '999', entries: [] }, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.missing })
    expect(replaceEntries).not.toHaveBeenCalled()
  })

  it('400s a body naming no performance', async () => {
    const { all } = deps()
    expect((await handleLineupReplace({ entries: [] }, all)).status).toBe(400)
    expect((await handleLineupReplace(null, all)).status).toBe(400)
  })

  it.each([
    ['a duplicated member', [{ memberId: '1', role: 'crni' }, { memberId: '1', role: 'bili' }], LINEUP_ERRORS.duplicateMember],
    ['an unknown role', [{ memberId: '1', role: 'kapetan' }], LINEUP_ERRORS.unknownRole],
    ['somebody off the roster', [{ memberId: '404', role: 'crni' }], LINEUP_ERRORS.unknownMember],
    ['entries that are not a list', 'crni', LINEUP_ERRORS.notAList],
  ])('400s %s and writes nothing', async (_label, entries, error) => {
    const { all, replaceEntries } = deps()
    const result = await handleLineupReplace({ performanceId: '10', entries }, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error })
    expect(replaceEntries).not.toHaveBeenCalled()
  })

  it('refuses a cross-site request before it reads anything', async () => {
    const loadPerformance = vi.fn()
    const { all, replaceEntries } = deps({
      request: { ...sameSite, secFetchSite: 'cross-site' },
      loadPerformance,
    })
    const result = await handleLineupReplace({ performanceId: '10', entries: [] }, all)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.rejected })
    expect(loadPerformance).not.toHaveBeenCalled()
    expect(replaceEntries).not.toHaveBeenCalled()
  })

  it('415s a body that is not JSON', async () => {
    const { all } = deps({ request: { ...sameSite, contentType: 'text/plain' } })
    const result = await handleLineupReplace({ performanceId: '10', entries: [] }, all)
    expect(result.status).toBe(415)
  })
})

describe('handleLineupConfirm', () => {
  const confirmDeps = (over: Partial<Parameters<typeof handleLineupConfirm>[1]> = {}) => {
    const setConfirmed = vi.fn().mockResolvedValue(undefined)
    return {
      setConfirmed,
      all: {
        request: sameSite,
        loadPerformance: async (id: string): Promise<LineupPerformance | null> =>
          id === '10' ? { id: '10', confirmed: false } : null,
        setConfirmed,
        now: () => new Date('2026-08-05T19:00:00.000Z'),
        ...over,
      },
    }
  }

  it('confirms and stamps the time', async () => {
    const { all, setConfirmed } = confirmDeps()
    const result = await handleLineupConfirm({ performanceId: '10', confirmed: true }, all)
    expect(result.status).toBe(200)
    expect(setConfirmed).toHaveBeenCalledWith('10', true, '2026-08-05T19:00:00.000Z')
    expect(result.body).toEqual({
      ok: true,
      confirmed: true,
      confirmedAt: '2026-08-05T19:00:00.000Z',
    })
  })

  it('unlocks and clears the timestamp, so it never outlives the confirmation', async () => {
    const { all, setConfirmed } = confirmDeps({
      loadPerformance: async () => ({ id: '10', confirmed: true }),
    })
    const result = await handleLineupConfirm({ performanceId: '10', confirmed: false }, all)
    expect(result.status).toBe(200)
    expect(setConfirmed).toHaveBeenCalledWith('10', false, null)
  })

  it('400s a `confirmed` that is not a real boolean, rather than unlocking by accident', async () => {
    const { all, setConfirmed } = confirmDeps()
    for (const bad of [undefined, null, 'true', 1, 0]) {
      const result = await handleLineupConfirm({ performanceId: '10', confirmed: bad }, all)
      expect(result.status).toBe(400)
      expect(result.body).toEqual({ error: APP_STRINGS.lineup.badConfirm })
    }
    expect(setConfirmed).not.toHaveBeenCalled()
  })

  it('400s an unknown performance', async () => {
    const { all, setConfirmed } = confirmDeps()
    const result = await handleLineupConfirm({ performanceId: '999', confirmed: true }, all)
    expect(result.status).toBe(400)
    expect(setConfirmed).not.toHaveBeenCalled()
  })

  it('refuses a cross-site request', async () => {
    const { all, setConfirmed } = confirmDeps({
      request: { ...sameSite, secFetchSite: 'cross-site' },
    })
    const result = await handleLineupConfirm({ performanceId: '10', confirmed: true }, all)
    expect(result.status).toBe(403)
    expect(setConfirmed).not.toHaveBeenCalled()
  })
})
