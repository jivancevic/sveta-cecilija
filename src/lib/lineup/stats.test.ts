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
  it('counts performances and the four special roles', () => {
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
    expect(cici.roles).toEqual({ crni_kralj: 1, bili_kralj: 0, otmanovic: 0, bula: 1 })
    const dado = rows.find((r) => r.nickname === 'Dado')!
    expect(dado.roles).toEqual({ crni_kralj: 0, bili_kralj: 1, otmanovic: 1, bula: 0 })
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
    expect(grgo.roles).toEqual({ crni_kralj: 0, bili_kralj: 0, otmanovic: 0, bula: 0 })
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
