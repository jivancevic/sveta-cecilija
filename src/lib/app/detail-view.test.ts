import { describe, expect, it } from 'vitest'
import {
  compUnavailableReason,
  formatConfirmedAt,
  groupLineupByRole,
  parseSegment,
} from './detail-view'
import type { LineupRow } from './detail-loaders'

// #457 — the three rules the detail screen's segments rest on.

describe('parseSegment', () => {
  it('takes the three known segments', () => {
    expect(parseSegment('dolaze')).toBe('dolaze')
    expect(parseSegment('postava')).toBe('postava')
    expect(parseSegment('ulaznice')).toBe('ulaznice')
  })

  it('falls back to Dolaze for anything else', () => {
    // A stale push link is still a link to the evening.
    expect(parseSegment(undefined)).toBe('dolaze')
    expect(parseSegment(null)).toBe('dolaze')
    expect(parseSegment('')).toBe('dolaze')
    expect(parseSegment('POSTAVA')).toBe('dolaze')
    expect(parseSegment('karte')).toBe('dolaze')
  })
})

describe('groupLineupByRole', () => {
  const row = (memberId: string, nickname: string, role: LineupRow['role']): LineupRow => ({
    memberId,
    nickname,
    role,
  })

  it('orders the sections kralj, kralj, otmanović, bula, crni, bili', () => {
    const groups = groupLineupByRole([
      row('1', 'Cici', 'bili'),
      row('2', 'Bepo', 'crni_kralj'),
      row('3', 'Dado', 'crni'),
      row('4', 'Frane', 'bula'),
      row('5', 'Grgo', 'bili_kralj'),
      row('6', 'Ivo', 'otmanovic'),
    ])
    expect(groups.map((g) => g.role)).toEqual([
      'crni_kralj',
      'bili_kralj',
      'otmanovic',
      'bula',
      'crni',
      'bili',
    ])
  })

  it('keeps an empty special role as a section and drops an empty army', () => {
    const groups = groupLineupByRole([row('1', 'Cici', 'crni')])
    expect(groups.map((g) => g.role)).toEqual([
      'crni_kralj',
      'bili_kralj',
      'otmanovic',
      'bula',
      'crni',
    ])
    expect(groups.find((g) => g.role === 'crni_kralj')?.entries).toEqual([])
    expect(groups.find((g) => g.role === 'crni')?.entries).toHaveLength(1)
  })

  it('keeps every entry of a role together', () => {
    const groups = groupLineupByRole([
      row('1', 'Cici', 'crni'),
      row('2', 'Bepo', 'crni'),
      row('3', 'Dado', 'bili'),
    ])
    expect(groups.find((g) => g.role === 'crni')?.entries.map((e) => e.nickname)).toEqual([
      'Cici',
      'Bepo',
    ])
    expect(groups.find((g) => g.role === 'bili')?.entries).toHaveLength(1)
  })

  it('renders all four special sections for an empty postava', () => {
    expect(groupLineupByRole([]).map((g) => g.role)).toEqual([
      'crni_kralj',
      'bili_kralj',
      'otmanovic',
      'bula',
    ])
  })
})

describe('compUnavailableReason', () => {
  const NOW = Date.parse('2026-08-05T10:00:00.000Z')
  const upcoming = { isPublic: true, cancelled: false, startMs: NOW + 86_400_000 }

  it('is null for a public upcoming evening with a Member link', () => {
    expect(compUnavailableReason(upcoming, '1', NOW)).toBeNull()
  })

  it('names the private evening first', () => {
    expect(compUnavailableReason({ ...upcoming, isPublic: false }, '1', NOW)).toBe('private')
    // Even for a viewer with no Member: there is nothing to issue either way.
    expect(compUnavailableReason({ ...upcoming, isPublic: false }, null, NOW)).toBe('private')
  })

  it('names a cancellation', () => {
    expect(compUnavailableReason({ ...upcoming, cancelled: true }, '1', NOW)).toBe('cancelled')
  })

  it('names an evening that has begun, and an unusable time', () => {
    expect(compUnavailableReason({ ...upcoming, startMs: NOW }, '1', NOW)).toBe('past')
    expect(compUnavailableReason({ ...upcoming, startMs: NOW - 1 }, '1', NOW)).toBe('past')
    expect(compUnavailableReason({ ...upcoming, startMs: Number.NaN }, '1', NOW)).toBe('past')
  })

  it('names the missing Member link last', () => {
    expect(compUnavailableReason(upcoming, null, NOW)).toBe('noMember')
  })
})

describe('formatConfirmedAt', () => {
  it('prints the Zagreb wall clock', () => {
    // 14:40 UTC in September is 16:40 in Zagreb.
    expect(formatConfirmedAt('2026-09-12T14:40:00.000Z')).toBe('12. 9. u 16:40')
  })

  it('is empty for nothing and for rubbish', () => {
    expect(formatConfirmedAt(null)).toBe('')
    expect(formatConfirmedAt(undefined)).toBe('')
    expect(formatConfirmedAt('nije datum')).toBe('')
  })
})
