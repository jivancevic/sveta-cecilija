import { describe, expect, it } from 'vitest'

import { ENTRANCE_OPENS_MINUTES_BEFORE, entranceTime } from './entrance-time'

describe('entranceTime', () => {
  it('opens half an hour before the show every evening of the season starts', () => {
    expect(entranceTime('21:00')).toBe('20:30')
    expect(entranceTime('20:00')).toBe('19:30')
  })

  it('crosses the hour downwards', () => {
    expect(entranceTime('21:15')).toBe('20:45')
    expect(entranceTime('21:29')).toBe('20:59')
  })

  it('reads a seconds suffix and a single-digit hour, both shapes a varchar allows', () => {
    expect(entranceTime('21:00:00')).toBe('20:30')
    expect(entranceTime('9:30')).toBe('09:00')
    expect(entranceTime(' 21:00 ')).toBe('20:30')
  })

  it('returns null rather than a wrong time when the start is unreadable', () => {
    expect(entranceTime('')).toBeNull()
    expect(entranceTime('evening')).toBeNull()
    expect(entranceTime('21h')).toBeNull()
    expect(entranceTime('25:00')).toBeNull()
    expect(entranceTime('21:75')).toBeNull()
  })

  it('returns null rather than wrapping to the previous day', () => {
    expect(entranceTime('00:15')).toBeNull()
    expect(entranceTime('00:30')).toBe('00:00')
  })

  it('keeps the offset as one named constant', () => {
    expect(ENTRANCE_OPENS_MINUTES_BEFORE).toBe(30)
  })
})
