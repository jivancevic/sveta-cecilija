import { describe, expect, it } from 'vitest'
import {
  aggregateDancerStats,
  resolveSeason,
  seasonOptions,
  type StatsLineupRow,
  type StatsPerformance,
} from './stats'
import type { AttendanceMember } from '@/lib/attendance/rules'

// #437 — the season scoreboard, over fixture rows.

const member = (id: string, nickname: string): AttendanceMember => ({
  id,
  nickname,
  roles: ['crni'],
  primaryRole: 'crni',
  active: true,
  isMoreskant: true,
})

const roster = [member('1', 'Cici'), member('2', 'Dado'), member('3', 'Grgo')]

const performance = (id: string, kind: StatsPerformance['kind'], confirmed = true): StatsPerformance => ({
  id,
  kind,
  confirmed,
})

const row = (performanceId: string, memberId: string, role: StatsLineupRow['role']): StatsLineupRow => ({
  performanceId,
  memberId,
  role,
})

describe('aggregateDancerStats', () => {
  it('counts performances and the titles a voditelj handed out', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna'), performance('11', 'dmc')],
      lineups: [
        row('10', '1', 'crni_kralj'),
        row('11', '1', 'bula'),
        row('10', '2', 'bili_kralj'),
        row('11', '2', 'otmanovic'),
      ],
      roster,
    })
    const cici = rows.find((r) => r.nickname === 'Cici')!
    expect(cici.performances).toBe(2)
    expect(cici.roles).toEqual({
      crni: 0,
      bili: 0,
      crni_kralj: 1,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 1,
      voditelj: 0,
    })
    const dado = rows.find((r) => r.nickname === 'Dado')!
    expect(dado.roles).toEqual({
      crni: 0,
      bili: 0,
      crni_kralj: 0,
      otmanovic: 1,
      bili_kralj: 1,
      bula: 0,
      voditelj: 0,
    })
  })

  // #568 — Ljestvica ranks one KIND of evening at a time, so the titles line
  // beside a count has to be scoped the same way or the two do not add up.
  it('splits the four titles by kind, leaving the season-wide count alone', () => {
    const rows = aggregateDancerStats({
      performances: [
        performance('10', 'redovna'),
        performance('11', 'redovna'),
        performance('12', 'experience'),
      ],
      lineups: [
        row('10', '1', 'crni_kralj'),
        row('11', '1', 'crni_kralj'),
        row('12', '1', 'bula'),
      ],
      roster,
    })
    const cici = rows.find((r) => r.nickname === 'Cici')!
    // Six keys since #607, not four: the tally is every dance role, so a row's
    // counts add up to the performances beside them.
    expect(cici.roles).toEqual({
      crni: 0,
      bili: 0,
      crni_kralj: 2,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 1,
      voditelj: 0,
    })
    expect(cici.rolesByKind.redovna).toEqual({
      crni: 0,
      bili: 0,
      crni_kralj: 2,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 0,
      voditelj: 0,
    })
    expect(cici.rolesByKind.experience).toEqual({
      crni: 0,
      bili: 0,
      crni_kralj: 0,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 1,
      voditelj: 0,
    })
    // Every kind is a key, zeros included, so no caller has to guard.
    expect(cici.rolesByKind.dmc).toEqual({
      crni: 0,
      bili: 0,
      crni_kralj: 0,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 0,
      voditelj: 0,
    })
  })

  it('counts a plain army in the per-kind split, and gives it no title (#607)', () => {
    // A plain crni or bili is an army, not a title (CONTEXT.md → *Title*), so
    // it is counted under its own key and leaves every crown at zero.
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna')],
      lineups: [row('10', '1', 'crni'), row('10', '2', 'bili')],
      roster,
    })
    const cici = rows.find((r) => r.nickname === 'Cici')!
    const dado = rows.find((r) => r.nickname === 'Dado')!
    expect(cici.performances).toBe(1)
    expect(cici.rolesByKind.redovna).toEqual({
      crni: 1,
      bili: 0,
      crni_kralj: 0,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 0,
      voditelj: 0,
    })
    expect(dado.rolesByKind.redovna).toEqual({
      crni: 0,
      bili: 1,
      crni_kralj: 0,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 0,
      voditelj: 0,
    })
  })

  it('makes a dancer’s tallies add up to the evenings they danced (#607)', () => {
    // The whole point of counting the plain roles: a reader can check the
    // arithmetic of a row, and a breakdown nobody can check is decoration.
    const rows = aggregateDancerStats({
      performances: [
        performance('10', 'redovna'),
        performance('11', 'redovna'),
        performance('12', 'redovna'),
      ],
      lineups: [
        row('10', '1', 'crni'),
        row('11', '1', 'crni_kralj'),
        row('12', '1', 'bili'),
      ],
      roster,
    })
    const cici = rows.find((r) => r.nickname === 'Cici')!
    expect(Object.values(cici.roles).reduce((a, b) => a + b, 0)).toBe(cici.performances)
    expect(cici.roles).toEqual({
      crni: 1,
      bili: 1,
      crni_kralj: 1,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 0,
      voditelj: 0,
    })
  })

  it('leaves a dancer who danced nothing with every per-kind title at zero', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna')],
      lineups: [row('10', '1', 'crni_kralj')],
      roster,
    })
    const grgo = rows.find((r) => r.nickname === 'Grgo')!
    expect(grgo.performances).toBe(0)
    expect(
      Object.values(grgo.rolesByKind).every((byRole) =>
        Object.values(byRole).every((n) => n === 0),
      ),
    ).toBe(true)
  })

  it('counts a plain crni or bili as a performance and no special role', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna')],
      lineups: [row('10', '1', 'crni'), row('10', '2', 'bili')],
      roster,
    })
    expect(rows.find((r) => r.nickname === 'Cici')!.performances).toBe(1)
    expect(rows.find((r) => r.nickname === 'Cici')!.roles.crni_kralj).toBe(0)
  })

  // Story 39: a draft may not inflate anybody.
  it('ignores lineups of unconfirmed performances entirely', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna', false), performance('11', 'redovna')],
      lineups: [row('10', '1', 'crni_kralj'), row('11', '1', 'crni')],
      roster,
    })
    const cici = rows.find((r) => r.nickname === 'Cici')!
    expect(cici.performances).toBe(1)
    expect(cici.roles.crni_kralj).toBe(0)
    expect(cici.byKind.redovna).toBe(1)
  })

  it('splits the total by performance kind', () => {
    const rows = aggregateDancerStats({
      performances: [
        performance('10', 'redovna'),
        performance('11', 'redovna'),
        performance('12', 'dmc'),
        performance('13', 'koncert'),
      ],
      lineups: [
        row('10', '1', 'crni'),
        row('11', '1', 'crni'),
        row('12', '1', 'crni'),
        row('13', '1', 'crni'),
      ],
      roster,
    })
    expect(rows.find((r) => r.nickname === 'Cici')!.byKind).toEqual({
      redovna: 2,
      dmc: 1,
      gulliver: 0,
      koncert: 1,
      experience: 0,
      ostalo: 0,
    })
  })

  // The season boundary is the caller's: the aggregation counts what it is
  // handed, so a performance outside the query never reaches it.
  it('counts only the performances it was handed', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna')],
      lineups: [row('10', '1', 'crni'), row('99', '1', 'crni')],
      roster,
    })
    expect(rows.find((r) => r.nickname === 'Cici')!.performances).toBe(1)
  })

  it('lists a dancer who danced nothing, with zeros', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna')],
      lineups: [row('10', '1', 'crni')],
      roster,
    })
    const grgo = rows.find((r) => r.nickname === 'Grgo')!
    expect(grgo.performances).toBe(0)
    expect(grgo.roles).toEqual({
      crni: 0,
      bili: 0,
      crni_kralj: 0,
      otmanovic: 0,
      bili_kralj: 0,
      bula: 0,
      voditelj: 0,
    })
    expect(grgo.byKind.redovna).toBe(0)
  })

  it('ignores a row for somebody who is not on the roster', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna')],
      lineups: [row('10', '404', 'crni')],
      roster,
    })
    expect(rows.every((r) => r.performances === 0)).toBe(true)
  })

  it('never counts one dancer twice for one evening', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna')],
      lineups: [row('10', '1', 'crni'), row('10', '1', 'crni_kralj')],
      roster,
    })
    expect(rows.find((r) => r.nickname === 'Cici')!.performances).toBe(1)
  })

  // Story 41.
  it('sorts by performances danced, then by nickname', () => {
    const rows = aggregateDancerStats({
      performances: [performance('10', 'redovna'), performance('11', 'redovna')],
      lineups: [row('10', '3', 'crni'), row('11', '3', 'crni'), row('10', '2', 'crni')],
      roster,
    })
    // Grgo 2, Dado 1, Cici 0 — and Cici sorts before nobody, so the tie-break
    // only shows once two dancers share a number.
    expect(rows.map((r) => r.nickname)).toEqual(['Grgo', 'Dado', 'Cici'])

    const tied = aggregateDancerStats({
      performances: [performance('10', 'redovna')],
      lineups: [],
      roster,
    })
    expect(tied.map((r) => r.nickname)).toEqual(['Cici', 'Dado', 'Grgo'])
  })
})

describe('resolveSeason', () => {
  it('takes a known four-digit year', () => {
    expect(resolveSeason('2025', 2026, [2026, 2025, 2024])).toBe(2025)
  })

  it('falls back to the current season for anything unparseable', () => {
    for (const bad of [undefined, null, '', 'letos', '20', '20266', 42]) {
      expect(resolveSeason(bad, 2026, [2026, 2025])).toBe(2026)
    }
  })

  it('falls back for a well-formed year that is not on the list', () => {
    expect(resolveSeason('1999', 2026, [2026, 2025])).toBe(2026)
  })
})

describe('seasonOptions', () => {
  it('runs from the first performance ever to the current season, newest first', () => {
    expect(seasonOptions(2024, 2026)).toEqual([2026, 2025, 2024])
  })

  it('is just this season when there is nothing older', () => {
    expect(seasonOptions(null, 2026)).toEqual([2026])
    expect(seasonOptions(2026, 2026)).toEqual([2026])
    expect(seasonOptions(2030, 2026)).toEqual([2026])
  })
})
