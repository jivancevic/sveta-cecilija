import { describe, expect, it, vi } from 'vitest'
import { handleLineupConfirm, handleLineupReplace, type LineupPerformance } from './replace'
import type { LineupConfirmOutcome } from './write-tx'
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

/** A voditelj, who keeps every list. */
const VODITELJ = { user: { permissions: ['moreska'] }, memberId: null }
/** A plain moreškant, Member 7, who keeps only the evening that names them. */
const ZADUZENI = { user: { permissions: ['moreskant'] }, memberId: '7' }

function deps(over: Partial<Parameters<typeof handleLineupReplace>[1]> = {}) {
  const replaceEntries = vi.fn().mockResolvedValue({ written: true })
  return {
    replaceEntries,
    all: {
      request: sameSite,
      actor: VODITELJ,
      loadPerformance: async (id: string): Promise<LineupPerformance | null> =>
        id === '10' ? { id: '10', confirmed: false, kind: 'redovna' as const, listKeepers: [] } : null,
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
      loadPerformance: async () => ({ id: '10', confirmed: true, kind: 'redovna' as const, listKeepers: [] }),
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

  // #442 review: the pre-check passed and a Potvrdi landed before the locked
  // read. Only the write's own answer counts, and it must reach the voditelj as
  // the same 409 and the same sentence a plain refusal gives.
  it('409s when the LOCKED re-check finds the lineup confirmed after the pre-check passed', async () => {
    const { all } = deps({
      loadPerformance: async () => ({ id: '10', confirmed: false, kind: 'redovna' as const, listKeepers: [] }),
      replaceEntries: vi.fn().mockResolvedValue({ written: false, reason: 'confirmed' }),
    })
    const result = await handleLineupReplace(
      { performanceId: '10', entries: [{ memberId: '1', role: 'crni' }] },
      all,
    )
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.locked })
  })

  // The row question (#658, ADR-0029). The delegation is bounded by the evening,
  // so each of these is a pair: the evening that names them, and one that
  // does not.
  it('lets the evening’s zaduženi replace its postava', async () => {
    const { all, replaceEntries } = deps({
      actor: ZADUZENI,
      loadPerformance: async () => ({
        id: '10',
        confirmed: false,
        kind: 'redovna' as const,
        listKeepers: ['7'],
      }),
    })
    const result = await handleLineupReplace({ performanceId: '10', entries: [] }, all)
    expect(result.status).toBe(200)
    expect(replaceEntries).toHaveBeenCalled()
  })

  it('403s the same account on an evening that names somebody else, writing nothing', async () => {
    const { all, replaceEntries } = deps({
      actor: ZADUZENI,
      loadPerformance: async () => ({
        id: '10',
        confirmed: false,
        kind: 'redovna' as const,
        listKeepers: ['9'],
      }),
    })
    const result = await handleLineupReplace({ performanceId: '10', entries: [] }, all)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.notKeeper })
    expect(replaceEntries).not.toHaveBeenCalled()
  })

  it('403s a plain moreškant on an evening that names nobody', async () => {
    const { all } = deps({ actor: ZADUZENI })
    const result = await handleLineupReplace({ performanceId: '10', entries: [] }, all)
    expect(result.status).toBe(403)
  })

  // The row refusal comes BEFORE the confirmation one: a moreškant who does not
  // keep this list learns nothing about whether its postava is locked.
  it('403s rather than 409s a stranger on a confirmed evening', async () => {
    const { all } = deps({
      actor: ZADUZENI,
      loadPerformance: async () => ({
        id: '10',
        confirmed: true,
        kind: 'redovna' as const,
        listKeepers: [],
      }),
    })
    const result = await handleLineupReplace(
      { performanceId: '10', entries: [{ memberId: '1', role: 'crni' }] },
      all,
    )
    expect(result.status).toBe(403)
  })

  it('400s when the performance disappeared between the pre-check and the lock', async () => {
    const { all } = deps({
      replaceEntries: vi.fn().mockResolvedValue({ written: false, reason: 'missing' }),
    })
    const result = await handleLineupReplace({ performanceId: '10', entries: [] }, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.missing })
  })
})

describe('handleLineupConfirm', () => {
  const confirmDeps = (
    outcome: LineupConfirmOutcome = { ok: true, confirmed: true, confirmedAt: '2026-08-05T19:00:00.000Z' },
    over: Partial<Parameters<typeof handleLineupConfirm>[1]> = {},
  ) => {
    const setConfirmed = vi.fn().mockResolvedValue(outcome)
    const loadPerformance = async (id: string): Promise<LineupPerformance | null> =>
      id === '10' ? { id: '10', confirmed: false, kind: 'redovna' as const, listKeepers: [] } : null
    return {
      setConfirmed,
      all: { request: sameSite, actor: VODITELJ, loadPerformance, setConfirmed, ...over },
    }
  }

  it('confirms and answers with the stamp the locked write decided', async () => {
    const { all, setConfirmed } = confirmDeps()
    const result = await handleLineupConfirm({ performanceId: '10', confirmed: true }, all)
    expect(result.status).toBe(200)
    expect(setConfirmed).toHaveBeenCalledWith('10', true)
    expect(result.body).toEqual({
      ok: true,
      confirmed: true,
      confirmedAt: '2026-08-05T19:00:00.000Z',
    })
  })

  it('lets the evening’s zaduženi confirm it, and unlock it afterwards', async () => {
    const kept = async () => ({
      id: '10',
      confirmed: false,
      kind: 'redovna' as const,
      listKeepers: ['7'],
    })
    const { all, setConfirmed } = confirmDeps(undefined, {
      actor: ZADUZENI,
      loadPerformance: kept,
    })
    expect((await handleLineupConfirm({ performanceId: '10', confirmed: true }, all)).status).toBe(200)
    expect((await handleLineupConfirm({ performanceId: '10', confirmed: false }, all)).status).toBe(200)
    expect(setConfirmed).toHaveBeenCalledTimes(2)
  })

  it('403s a moreškant who does not keep this evening’s list, confirming nothing', async () => {
    const { all, setConfirmed } = confirmDeps(undefined, { actor: ZADUZENI })
    const result = await handleLineupConfirm({ performanceId: '10', confirmed: true }, all)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.notKeeper })
    expect(setConfirmed).not.toHaveBeenCalled()
  })

  it('400s an unknown performance before it asks who keeps its list', async () => {
    const { all } = confirmDeps(undefined, { actor: ZADUZENI })
    const result = await handleLineupConfirm({ performanceId: '99', confirmed: true }, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.missing })
  })

  it('unlocks and clears the timestamp', async () => {
    const { all, setConfirmed } = confirmDeps({ ok: true, confirmed: false, confirmedAt: null })
    const result = await handleLineupConfirm({ performanceId: '10', confirmed: false }, all)
    expect(result.status).toBe(200)
    expect(setConfirmed).toHaveBeenCalledWith('10', false)
    expect(result.body).toEqual({ ok: true, confirmed: false, confirmedAt: null })
  })

  it('400s an empty postava with its own sentence', async () => {
    const { all } = confirmDeps({ ok: false, reason: 'empty' })
    const result = await handleLineupConfirm({ performanceId: '10', confirmed: true }, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.confirmEmpty })
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
    const { all } = confirmDeps({ ok: false, reason: 'missing' })
    const result = await handleLineupConfirm({ performanceId: '999', confirmed: true }, all)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.lineup.missing })
  })

  it('refuses a cross-site request', async () => {
    const { all, setConfirmed } = confirmDeps(undefined, {
      request: { ...sameSite, secFetchSite: 'cross-site' },
    })
    const result = await handleLineupConfirm({ performanceId: '10', confirmed: true }, all)
    expect(result.status).toBe(403)
    expect(setConfirmed).not.toHaveBeenCalled()
  })
})


// #620 — a `voditelj` line belongs to a Moreška Experience and to nothing else.
describe('handleLineupReplace and the voditelj line (#620)', () => {
  it('refuses a voditelj row on an ordinary moreška, and writes nothing', async () => {
    const { all, replaceEntries } = deps()
    const result = await handleLineupReplace(
      { performanceId: '10', entries: [{ memberId: '1', role: 'voditelj' }] },
      all,
    )
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: 'Voditelja ima samo Moreška Experience.' })
    expect(replaceEntries).not.toHaveBeenCalled()
  })

  it('writes the same row on an Experience', async () => {
    const { all, replaceEntries } = deps({
      loadPerformance: async () => ({ id: '10', confirmed: false, kind: 'experience' as const, listKeepers: [] }),
    })
    const result = await handleLineupReplace(
      { performanceId: '10', entries: [{ memberId: '1', role: 'voditelj' }] },
      all,
    )
    expect(result.status).toBe(200)
    expect(replaceEntries).toHaveBeenCalledWith('10', [{ memberId: '1', role: 'voditelj' }])
  })
})
