import { describe, expect, it, vi } from 'vitest'
import {
  buildMySeason,
  loadMySeason,
  toMySeasonLineupRow,
  toMySeasonPerformance,
  type MySeasonLineupRow,
  type MySeasonPerformance,
} from './my-season-loaders'

const perf = (
  id: string,
  date: string,
  over: Partial<MySeasonPerformance> = {},
): MySeasonPerformance => ({ id, date, confirmed: true, cancelled: false, ...over })

const row = (performanceId: string, role: MySeasonLineupRow['role'], memberId = '3') => ({
  performanceId,
  memberId,
  role,
})

describe('buildMySeason', () => {
  const base = { season: 2026, seasons: [2026, 2025], memberId: '3' }

  it('counts only confirmed, non-cancelled evenings', () => {
    const out = buildMySeason({
      ...base,
      performances: [
        perf('1', '2026-07-04'),
        perf('2', '2026-07-11', { confirmed: false }),
        perf('3', '2026-07-18', { cancelled: true }),
      ],
      lineups: [row('1', 'crni'), row('2', 'crni'), row('3', 'crni')],
    })
    expect(out.confirmedTotal).toBe(1)
    expect(out.mine).toBe(1)
    expect(out.roles.crni).toBe(1)
  })

  it('counts a role once per evening and never twice from a duplicated row', () => {
    const out = buildMySeason({
      ...base,
      performances: [perf('1', '2026-07-04')],
      lineups: [row('1', 'otmanovic'), row('1', 'otmanovic')],
    })
    expect(out.mine).toBe(1)
    expect(out.roles.otmanovic).toBe(1)
  })

  it('splits the armies the way the role map does, with the bula in neither', () => {
    const out = buildMySeason({
      ...base,
      performances: [
        perf('1', '2026-06-04'),
        perf('2', '2026-06-11'),
        perf('3', '2026-06-18'),
        perf('4', '2026-06-25'),
        perf('5', '2026-07-02'),
      ],
      lineups: [
        row('1', 'crni'),
        row('2', 'crni_kralj'),
        row('3', 'otmanovic'),
        row('4', 'bili_kralj'),
        row('5', 'bula'),
      ],
    })
    expect(out.armyCrni).toBe(3)
    expect(out.armyBili).toBe(1)
    expect(out.mine).toBe(5)
    expect(out.roles).toEqual({
      crni: 1,
      bili: 0,
      crni_kralj: 1,
      otmanovic: 1,
      bili_kralj: 1,
      bula: 1,
    })
  })

  it('ignores another dancer\'s rows', () => {
    const out = buildMySeason({
      ...base,
      performances: [perf('1', '2026-07-04')],
      lineups: [row('1', 'crni', '9')],
    })
    expect(out.mine).toBe(0)
    expect(out.empty).toBe(true)
  })

  it('has no season at all for a voditelj with no Member row', () => {
    const out = buildMySeason({
      ...base,
      memberId: null,
      performances: [perf('1', '2026-07-04')],
      lineups: [row('1', 'crni')],
    })
    expect(out.mine).toBe(0)
    expect(out.confirmedTotal).toBe(1)
    expect(out.empty).toBe(true)
  })

  it('bars only the months that have a confirmed evening, in calendar order', () => {
    const out = buildMySeason({
      ...base,
      performances: [
        perf('1', '2026-09-17'),
        perf('2', '2026-09-21'),
        perf('3', '2026-07-04'),
        perf('4', '2026-08-01', { confirmed: false }),
      ],
      lineups: [row('1', 'crni')],
    })
    expect(out.byMonth).toEqual([
      { month: 7, label: 'srp', total: 1, mine: 0 },
      { month: 9, label: 'ruj', total: 2, mine: 1 },
    ])
  })
})

describe('toMySeasonPerformance / toMySeasonLineupRow', () => {
  it('reads the two flags off a raw doc', () => {
    expect(
      toMySeasonPerformance({
        id: 7,
        date: '2026-07-04T00:00:00.000Z',
        lineupConfirmed: true,
        status: 'cancelled',
      }),
    ).toEqual({ id: '7', date: '2026-07-04', confirmed: true, cancelled: true })
  })

  it('drops a lineup row with no relation or an unknown role', () => {
    expect(toMySeasonLineupRow({ performance: 1, member: 3, role: 'crni' })).toEqual({
      performanceId: '1',
      memberId: '3',
      role: 'crni',
    })
    expect(toMySeasonLineupRow({ performance: 1, member: null, role: 'crni' })).toBeNull()
    expect(toMySeasonLineupRow({ performance: 1, member: 3, role: 'kapetan' })).toBeNull()
  })
})

describe('loadMySeason', () => {
  const deps = (over: Partial<Parameters<typeof loadMySeason>[2]> = {}) => ({
    loadPerformances: vi.fn(async () => [
      { id: 1, date: '2026-07-04T00:00:00.000Z', lineupConfirmed: true, status: 'active' },
    ]),
    loadLineups: vi.fn(async () => [{ performance: 1, member: 3, role: 'crni' }]),
    loadFirstSeason: vi.fn(async () => 2024),
    now: () => new Date('2026-07-01T10:00:00.000Z'),
    ...over,
  })

  it('falls back to the current season for a mistyped ?sezona=', async () => {
    const out = await loadMySeason('nope', '3', deps())
    expect(out.season).toBe(2026)
    expect(out.seasons).toEqual([2026, 2025, 2024])
  })

  it('honours a known season', async () => {
    const out = await loadMySeason('2025', '3', deps())
    expect(out.season).toBe(2025)
  })

  it('asks for no lineups at all without a Member link', async () => {
    const d = deps()
    const out = await loadMySeason(undefined, null, d)
    expect(d.loadLineups).not.toHaveBeenCalled()
    expect(out.mine).toBe(0)
  })

  it('asks for no lineups when nothing is confirmed', async () => {
    const d = deps({
      loadPerformances: vi.fn(async () => [
        { id: 1, date: '2026-07-04T00:00:00.000Z', lineupConfirmed: false, status: 'active' },
      ]),
    })
    await loadMySeason(undefined, '3', d)
    expect(d.loadLineups).not.toHaveBeenCalled()
  })

  it('scopes the lineup query to the confirmed evenings', async () => {
    const d = deps()
    const out = await loadMySeason(undefined, '3', d)
    expect(d.loadLineups).toHaveBeenCalledWith(['1'])
    expect(out.mine).toBe(1)
    expect(out.empty).toBe(false)
  })
})
