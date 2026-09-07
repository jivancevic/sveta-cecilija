import { describe, expect, it } from 'vitest'
import {
  PERFORMANCE_KINDS,
  PUBLIC_PERFORMANCE_WHERE,
  PerformanceValidationError,
  isPublicPerformance,
  publicPerformanceSql,
  validateAndNormalisePerformance,
} from './show-performance'

describe('public performance predicate', () => {
  it('exposes a Payload Where fragment that selects public rows', () => {
    expect(PUBLIC_PERFORMANCE_WHERE).toEqual({ isPublic: { equals: true } })
  })

  it('exposes a SQL fragment, optionally table-qualified', () => {
    expect(publicPerformanceSql()).toBe('is_public = true')
    expect(publicPerformanceSql('s')).toBe('s.is_public = true')
    expect(publicPerformanceSql('shows')).toBe('shows.is_public = true')
  })

  it('recognises a public row in either camelCase or snake_case shape', () => {
    expect(isPublicPerformance({ isPublic: true })).toBe(true)
    expect(isPublicPerformance({ is_public: true })).toBe(true)
    expect(isPublicPerformance({ isPublic: false })).toBe(false)
    expect(isPublicPerformance({ is_public: false })).toBe(false)
  })

  it('treats a legacy row with neither key as public (pre-expand rows backfill to true)', () => {
    expect(isPublicPerformance({})).toBe(true)
  })

  it('lists the five performance kinds', () => {
    expect(PERFORMANCE_KINDS).toEqual(['redovna', 'dmc', 'gulliver', 'koncert', 'ostalo'])
  })
})

describe('validateAndNormalisePerformance', () => {
  const publicRedovna = {
    kind: 'redovna' as const,
    isPublic: true,
    venue: 'ljetno-kino',
    time: '21:00',
  }

  it('accepts a public redovna with a venue and leaves it untouched', () => {
    const out = validateAndNormalisePerformance({ ...publicRedovna })
    expect(out.venue).toBe('ljetno-kino')
    expect(out.isPublic).toBe(true)
    expect(out.kind).toBe('redovna')
  })

  it('rejects a redovna that is not public', () => {
    expect(() =>
      validateAndNormalisePerformance({ ...publicRedovna, isPublic: false, location: 'Sv. Justina' }),
    ).toThrow(PerformanceValidationError)
    expect(() =>
      validateAndNormalisePerformance({ ...publicRedovna, isPublic: false, location: 'Sv. Justina' }),
    ).toThrow(/redovna/i)
  })

  it('rejects a public performance without a venue', () => {
    expect(() => validateAndNormalisePerformance({ ...publicRedovna, venue: null })).toThrow(/venue/i)
    expect(() => validateAndNormalisePerformance({ ...publicRedovna, venue: undefined })).toThrow(/venue/i)
  })

  it('rejects a non-public performance without a location', () => {
    expect(() =>
      validateAndNormalisePerformance({ kind: 'dmc', isPublic: false, location: '' }),
    ).toThrow(/location/i)
    expect(() => validateAndNormalisePerformance({ kind: 'gulliver', isPublic: false })).toThrow(
      /location/i,
    )
  })

  it('accepts a non-public performance with a location', () => {
    const out = validateAndNormalisePerformance({
      kind: 'dmc',
      isPublic: false,
      location: 'Zimsko kino',
      client: 'Le Ponant',
    })
    expect(out.location).toBe('Zimsko kino')
    expect(out.client).toBe('Le Ponant')
  })

  it('forces venue NULL, counters 0 and sales-paused false on a non-public row', () => {
    const out = validateAndNormalisePerformance({
      kind: 'ostalo',
      isPublic: false,
      location: 'Spomenik sv. Todora',
      venue: 'ljetno-kino',
      inPersonSold: 12,
      legacyReserved: 4,
      onlineSalesPaused: true,
    })
    expect(out.venue).toBeNull()
    expect(out.inPersonSold).toBe(0)
    expect(out.legacyReserved).toBe(0)
    expect(out.onlineSalesPaused).toBe(false)
  })

  it('does not invent an onlineSalesPaused key when the row has none', () => {
    const out = validateAndNormalisePerformance({
      kind: 'koncert',
      isPublic: false,
      location: 'Sv. Justina',
    })
    expect('onlineSalesPaused' in out).toBe(false)
  })

  it('defaults a row with no kind/isPublic to a public redovna (pre-expand shape)', () => {
    const out = validateAndNormalisePerformance({ venue: 'zimsko-kino', time: '21:00' })
    expect(out.venue).toBe('zimsko-kino')
  })

  it('rejects an unknown kind', () => {
    expect(() =>
      validateAndNormalisePerformance({ kind: 'crveni-kriz', isPublic: true, venue: 'ljetno-kino' }),
    ).toThrow(/kind/i)
  })

  it('keeps the caller object untouched (returns a new object)', () => {
    const input = { kind: 'dmc' as const, isPublic: false, location: 'Zimsko kino', venue: 'ljetno-kino' }
    const out = validateAndNormalisePerformance(input)
    expect(input.venue).toBe('ljetno-kino')
    expect(out.venue).toBeNull()
  })
})
