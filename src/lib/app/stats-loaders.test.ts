import { describe, expect, it, vi } from 'vitest'
import { loadSeasonStats } from './stats-loaders'

// #437 — the loader half: which season is asked for, and the ONE query the
// spec asks for over the season's confirmed lineups.

const NOW = new Date('2026-08-05T10:00:00.000Z')

const shows = {
  2026: [
    { id: 10, date: '2026-07-01T12:00:00.000Z', kind: 'redovna', lineupConfirmed: true },
    { id: 11, date: '2026-07-08T12:00:00.000Z', kind: 'dmc', lineupConfirmed: true },
    // A draft: it must not reach the lineup query at all.
    { id: 12, date: '2026-07-15T12:00:00.000Z', kind: 'redovna', lineupConfirmed: false },
  ],
  2025: [{ id: 1, date: '2025-07-01T12:00:00.000Z', kind: 'redovna', lineupConfirmed: true }],
}

function deps(over: Partial<Parameters<typeof loadSeasonStats>[1]> = {}) {
  const loadLineups = vi.fn(async (ids: readonly string[]) =>
    [
      { id: 1, performance: 10, member: 1, role: 'crni_kralj' },
      { id: 2, performance: 11, member: 1, role: 'crni' },
      { id: 3, performance: 12, member: 2, role: 'crni' },
      { id: 4, performance: 1, member: 2, role: 'bili_kralj' },
      // Dado ran performance 10 as its voditelj: not dancing, so not counted.
      { id: 5, performance: 10, member: 2, role: 'voditelj' },
    ].filter((r) => ids.includes(String(r.performance))),
  )
  return {
    loadLineups,
    all: {
      loadPerformances: vi.fn(async (season: number) => shows[season as 2026 | 2025] ?? []),
      loadLineups,
      loadMoreskanti: async () => [
        { id: 1, name: 'Ivan', nickname: 'Cici', isMoreskant: true, active: true, roles: ['crni', 'crni_kralj'], primaryRole: 'crni_kralj' },
        { id: 2, name: 'Dado', nickname: 'Dado', isMoreskant: true, active: true, roles: ['bili'], primaryRole: 'bili' },
      ],
      loadFirstSeason: async () => 2024,
      now: () => NOW,
      ...over,
    },
  }
}

describe('loadSeasonStats', () => {
  it('defaults to the current season and offers every season back to the first', async () => {
    const { all } = deps()
    const result = await loadSeasonStats(undefined, all)
    expect(result.season).toBe(2026)
    expect(result.seasons).toEqual([2026, 2025, 2024])
  })

  it('takes the season from the query string', async () => {
    const { all } = deps()
    const result = await loadSeasonStats('2025', all)
    expect(result.season).toBe(2025)
    expect(all.loadPerformances).toHaveBeenCalledWith(2025)
    expect(result.rows.find((r) => r.nickname === 'Dado')!.roles.bili_kralj).toBe(1)
  })

  it('falls back to the current season for a nonsense one', async () => {
    const { all } = deps()
    expect((await loadSeasonStats('sezona', all)).season).toBe(2026)
    expect((await loadSeasonStats('1999', all)).season).toBe(2026)
  })

  // The spec's query shape: one call, with the CONFIRMED performances only.
  it('fetches the lineups in ONE query, over the confirmed performances only', async () => {
    const { all, loadLineups } = deps()
    const result = await loadSeasonStats('2026', all)
    expect(loadLineups).toHaveBeenCalledTimes(1)
    expect(loadLineups).toHaveBeenCalledWith(['10', '11'])
    expect(result.confirmedPerformances).toBe(2)
    // The draft's row (member 2 on performance 12) never reached the table, and
    // the voditelj line on performance 10 is not dancing.
    expect(result.rows.find((r) => r.nickname === 'Dado')!.performances).toBe(0)
    expect(result.rows.find((r) => r.nickname === 'Cici')!.performances).toBe(2)
  })

  it('runs no lineup query at all when nothing is confirmed', async () => {
    const { all, loadLineups } = deps({
      loadPerformances: async () => [
        { id: 12, date: '2026-07-15T12:00:00.000Z', kind: 'redovna', lineupConfirmed: false },
      ],
    })
    const result = await loadSeasonStats('2026', all)
    expect(loadLineups).not.toHaveBeenCalled()
    expect(result.confirmedPerformances).toBe(0)
    // Every active moreškant is still a row, at zero.
    expect(result.rows).toHaveLength(2)
    expect(result.rows.every((r) => r.performances === 0)).toBe(true)
  })

  // #568 — the two panels of Ljestvica read one season through two loaders, and
  // this is the rule they used to disagree about: `my-season-loaders.ts` has
  // dropped cancelled evenings since #457 and this half counted them.
  it('counts no cancelled evening, for the season or for a dancer', async () => {
    const { all, loadLineups } = deps({
      loadPerformances: async () => [
        { id: 10, date: '2026-07-01T12:00:00.000Z', kind: 'redovna', lineupConfirmed: true },
        {
          id: 11,
          date: '2026-07-08T12:00:00.000Z',
          kind: 'dmc',
          lineupConfirmed: true,
          status: 'cancelled',
        },
      ],
    })
    const result = await loadSeasonStats('2026', all)
    expect(loadLineups).toHaveBeenCalledWith(['10'])
    expect(result.confirmedPerformances).toBe(1)
    expect(result.confirmedByKind.redovna).toBe(1)
    expect(result.confirmedByKind.dmc).toBe(0)
    expect(result.rows.find((r) => r.nickname === 'Cici')!.performances).toBe(1)
  })

  it('splits the season by kind, for the two lists of Ljestvica (#568)', async () => {
    const { all } = deps({
      loadPerformances: async () => [
        { id: 10, date: '2026-07-01T12:00:00.000Z', kind: 'redovna', lineupConfirmed: true },
        { id: 11, date: '2026-07-08T12:00:00.000Z', kind: 'experience', lineupConfirmed: true },
        { id: 12, date: '2026-07-15T12:00:00.000Z', kind: 'redovna', lineupConfirmed: false },
      ],
    })
    const result = await loadSeasonStats('2026', all)
    expect(result.confirmedByKind.redovna).toBe(1)
    expect(result.confirmedByKind.experience).toBe(1)
    expect(result.confirmedByKind.gulliver).toBe(0)
    // The profile fact the board draws a mark from, and nothing else about a
    // member: no mobile, no e-mail (ADR-0024's PII boundary).
    expect(result.primaryRoles).toEqual({ '1': 'crni_kralj', '2': 'bili' })
  })

  it('offers only this season when nothing older exists', async () => {
    const { all } = deps({ loadFirstSeason: async () => null })
    expect((await loadSeasonStats(undefined, all)).seasons).toEqual([2026])
  })
})
