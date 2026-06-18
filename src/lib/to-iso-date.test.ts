import { describe, it, expect } from 'vitest'
import { toIsoDate } from './to-iso-date'

describe('toIsoDate', () => {
  it('handles a JS Date (what pg returns for timestamptz) — the "Invalid Date" regression', () => {
    // Shows are stored at noon UTC, so the UTC day is the intended day.
    expect(toIsoDate(new Date('2026-06-22T12:00:00Z'))).toBe('2026-06-22')
  })

  it('handles an ISO-ish timestamp string', () => {
    expect(toIsoDate('2026-06-22 12:00:00+00')).toBe('2026-06-22')
  })

  it('handles a bare date string', () => {
    expect(toIsoDate('2026-06-23')).toBe('2026-06-23')
  })

  it('returns empty string for null/undefined/garbage', () => {
    expect(toIsoDate(null)).toBe('')
    expect(toIsoDate(undefined)).toBe('')
    expect(toIsoDate('not a date')).toBe('')
    expect(toIsoDate(new Date('nope'))).toBe('')
  })
})
