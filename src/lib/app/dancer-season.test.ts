import { describe, expect, it } from 'vitest'
import {
  bestSeason,
  dancerEvenings,
  seasonCounts,
  toDancerIdentity,
  type DancerSeasonLineupRow,
  type DancerSeasonPerformance,
} from './dancer-season'

const show = (
  id: string,
  date: string,
  over: Partial<DancerSeasonPerformance> = {},
): DancerSeasonPerformance => ({
  id,
  date,
  kind: 'redovna',
  place: 'Ljetno kino',
  confirmed: true,
  cancelled: false,
  isPublic: true,
  ...over,
})

const line = (
  performanceId: string,
  memberId: string,
  role: DancerSeasonLineupRow['role'],
): DancerSeasonLineupRow => ({ performanceId, memberId, role })

describe('toDancerIdentity', () => {
  const row = {
    id: '1',
    name: 'Nikša Šeparović',
    nickname: 'Cici',
    roles: ['crni', 'crni_kralj', 'bili'],
    primaryRole: 'crni',
    isMoreskant: true,
  }

  it('carries the name, which is the whole point of the screen', () => {
    expect(toDancerIdentity(row, 'NŠ')).toEqual({
      memberId: '1',
      name: 'Nikša Šeparović',
      nickname: 'Cici',
      roles: ['crni', 'crni_kralj', 'bili'],
      army: 'crni',
      initials: 'NŠ',
    })
  })

  it('refuses a Member who is only a comp-attribution name', () => {
    // ADR-0019 rows have no season; rendering one a profile would invent a
    // dancer out of a bookkeeping name.
    expect(toDancerIdentity({ ...row, isMoreskant: false }, 'NŠ')).toBeNull()
    expect(toDancerIdentity(null, '')).toBeNull()
  })

  it('drops a role that is not in the vocabulary', () => {
    expect(toDancerIdentity({ ...row, roles: ['crni', 'kapetan'] }, 'NŠ')?.roles).toEqual(['crni'])
  })

  it('leaves the army null for a dancer with no primary role yet', () => {
    expect(toDancerIdentity({ ...row, primaryRole: null }, 'NŠ')?.army).toBeNull()
  })
})

describe('dancerEvenings', () => {
  const performances = [
    show('1', '2026-07-04'),
    show('2', '2026-08-11', { kind: 'dmc', isPublic: false, place: 'Ljetno kino' }),
    show('3', '2026-08-20', { confirmed: false }),
    show('4', '2026-08-25', { cancelled: true }),
    show('5', '2026-09-02', { kind: 'experience', isPublic: false, place: 'Ljetno kino' }),
  ]
  const lineups = [
    line('1', 'm1', 'crni'),
    line('2', 'm1', 'crni_kralj'),
    line('3', 'm1', 'crni'),
    line('4', 'm1', 'bili'),
    line('5', 'm1', 'crni'),
    line('1', 'm2', 'bili'),
  ]
  const evenings = dancerEvenings({ performances, lineups, memberId: 'm1' })

  it('is newest first', () => {
    expect(evenings.map((e) => e.performanceId)).toEqual(['5', '2', '1'])
  })

  it('leaves out a draft and a cancelled evening', () => {
    expect(evenings.map((e) => e.performanceId)).not.toContain('3')
    expect(evenings.map((e) => e.performanceId)).not.toContain('4')
  })

  it('names no venue for an evening that is not the society’s own', () => {
    // A vanredna is a booking, and naming where it was is one step from naming
    // the client. The dancer's register says the kind and stops.
    expect(evenings.find((e) => e.performanceId === '2')?.place).toBeNull()
    expect(evenings.find((e) => e.performanceId === '1')?.place).toBe('Ljetno kino')
  })

  it('carries the role worn that evening', () => {
    expect(evenings.find((e) => e.performanceId === '2')?.role).toBe('crni_kralj')
  })

  it('reads one person’s evenings and nobody else’s', () => {
    expect(dancerEvenings({ performances, lineups, memberId: 'm2' })).toHaveLength(1)
  })

  it('counts one evening once even if the database holds two rows', () => {
    expect(
      dancerEvenings({
        performances: [show('1', '2026-07-04')],
        lineups: [line('1', 'm1', 'crni'), line('1', 'm1', 'bili')],
        memberId: 'm1',
      }),
    ).toHaveLength(1)
  })
})

describe('seasonCounts', () => {
  const evenings = [
    { date: '2026-07-04', kind: 'redovna' as const },
    { date: '2026-08-11', kind: 'dmc' as const },
    { date: '2026-08-12', kind: 'experience' as const },
    { date: '2024-07-04', kind: 'redovna' as const },
  ]

  it('counts the Moreška list’s kinds and leaves the Experience out', () => {
    expect(seasonCounts(evenings)).toEqual([
      { season: 2026, count: 2 },
      { season: 2024, count: 1 },
    ])
  })

  it('counts the Experience list on its own when asked', () => {
    expect(seasonCounts(evenings, 'experience')).toEqual([{ season: 2026, count: 1 }])
  })
})

describe('bestSeason', () => {
  it('is the highest count, with the year it belongs to', () => {
    expect(bestSeason([{ season: 2026, count: 13 }, { season: 2024, count: 18 }], 2026)).toEqual({
      season: 2024,
      count: 18,
      isCurrent: false,
    })
  })

  it('counts the CURRENT season, and says so', () => {
    // Waiting for January to admit this is somebody's best year would make the
    // one thing the record can tell a dancer arrive after it stopped mattering.
    expect(bestSeason([{ season: 2026, count: 21 }, { season: 2024, count: 18 }], 2026)).toEqual({
      season: 2026,
      count: 21,
      isCurrent: true,
    })
  })

  it('gives a tie to the most recent season', () => {
    expect(
      bestSeason([{ season: 2026, count: 18 }, { season: 2024, count: 18 }], 2026)?.season,
    ).toBe(2026)
  })

  it('is null for a dancer who has never danced', () => {
    expect(bestSeason([], 2026)).toBeNull()
    expect(bestSeason([{ season: 2026, count: 0 }], 2026)).toBeNull()
  })
})
