import { describe, it, expect } from 'vitest'
import { showStartMs, isPastShowCutoff, SHOW_GRACE_MS } from './show-time'

// Summer-season Korčula is CEST (+02:00); all ticketed shows run May–September.
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

  it('uses a 1-hour grace window', () => {
    expect(SHOW_GRACE_MS).toBe(60 * 60 * 1000)
  })
})
