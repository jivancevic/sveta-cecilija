import { describe, it, expect } from 'vitest'
import { showStartMs, isPastShowCutoff, SHOW_GRACE_MS } from './show-time'

// Ticketed shows run May-September (CEST, +02:00), but the same helper serves
// the roster's whole-year reads (#421), so the DST cases below are the ones that
// used to be wrong under the old fixed +02:00 (review fix on #426).
describe('show-time', () => {
  it('resolves a dayOnly date + HH:MM to the Europe/Zagreb start instant', () => {
    // 21:30 local on 2026-06-08 == 19:30 UTC.
    expect(showStartMs('2026-06-08', '21:30')).toBe(Date.parse('2026-06-08T19:30:00Z'))
  })

  it('normalises a full ISO date string the same as a bare YYYY-MM-DD', () => {
    expect(showStartMs('2026-06-08T00:00:00.000Z', '21:30')).toBe(
      showStartMs('2026-06-08', '21:30'),
    )
  })

  const start = showStartMs('2026-06-08', '21:30')

  it('is not past before the show starts', () => {
    expect(isPastShowCutoff('2026-06-08', '21:30', start - 60_000)).toBe(false)
  })

  it('is not past within the 1-hour grace window after start', () => {
    expect(isPastShowCutoff('2026-06-08', '21:30', start + 30 * 60_000)).toBe(false)
    // Exactly at the edge of the window is still allowed.
    expect(isPastShowCutoff('2026-06-08', '21:30', start + SHOW_GRACE_MS)).toBe(false)
  })

  it('is past once more than an hour has elapsed since start', () => {
    expect(isPastShowCutoff('2026-06-08', '21:30', start + SHOW_GRACE_MS + 1)).toBe(true)
    expect(isPastShowCutoff('2026-06-08', '21:30', start + 90 * 60_000)).toBe(true)
  })

  // --- DST: the offset is computed, never assumed --------------------------
  it('resolves a summer performance at CEST (+02:00)', () => {
    expect(showStartMs('2026-07-15', '20:00')).toBe(Date.parse('2026-07-15T18:00:00Z'))
  })

  it('resolves a winter performance at CET (+01:00)', () => {
    expect(showStartMs('2026-11-07', '20:00')).toBe(Date.parse('2026-11-07T19:00:00Z'))
  })

  it('switches at the 2026-10-25 boundary, not at New Year', () => {
    // The Sunday of the switch itself: 20:00 is already CET.
    expect(showStartMs('2026-10-25', '20:00')).toBe(Date.parse('2026-10-25T19:00:00Z'))
    // The evening before is still CEST.
    expect(showStartMs('2026-10-24', '20:00')).toBe(Date.parse('2026-10-24T18:00:00Z'))
  })

  it('resolves the spring switch too', () => {
    expect(showStartMs('2026-03-28', '20:00')).toBe(Date.parse('2026-03-28T19:00:00Z'))
    expect(showStartMs('2026-03-29', '20:00')).toBe(Date.parse('2026-03-29T18:00:00Z'))
  })

  it('uses a 1-hour grace window', () => {
    expect(SHOW_GRACE_MS).toBe(60 * 60 * 1000)
  })
})
