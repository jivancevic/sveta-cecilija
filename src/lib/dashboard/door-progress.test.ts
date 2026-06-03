import { describe, it, expect } from 'vitest'
import { doorProgress, soldPeople } from './door-progress'

type ShowCounts = { onlineSold: number; inPersonSold: number }

const show = (onlineSold: number, inPersonSold: number): ShowCounts => ({ onlineSold, inPersonSold })

describe('soldPeople', () => {
  it('sums online and in-person sold', () => {
    expect(soldPeople(show(40, 10))).toBe(50)
  })

  it('treats missing counts as zero', () => {
    expect(soldPeople({} as ShowCounts)).toBe(0)
    expect(soldPeople({ onlineSold: 7 } as ShowCounts)).toBe(7)
  })

  it('never goes negative', () => {
    expect(soldPeople(show(-5, -5))).toBe(0)
  })
})

describe('doorProgress', () => {
  it('returns null when there is no active show (no show tonight)', () => {
    expect(doorProgress(null, 0)).toBeNull()
    expect(doorProgress(null, 12)).toBeNull()
  })

  it('reports admitted and sold counts for the active show', () => {
    const p = doorProgress(show(40, 10), 12)
    expect(p).toEqual({ admitted: 12, sold: 50, percent: 24 })
  })

  it('is zero-admitted at the start of the night', () => {
    expect(doorProgress(show(80, 0), 0)).toEqual({ admitted: 0, sold: 80, percent: 0 })
  })

  it('rounds the percent to a whole number', () => {
    // 1 of 3 admitted = 33.33% -> 33
    expect(doorProgress(show(3, 0), 1)!.percent).toBe(33)
    // 2 of 3 admitted = 66.66% -> 67
    expect(doorProgress(show(3, 0), 2)!.percent).toBe(67)
  })

  it('reaches 100% when everyone is admitted', () => {
    expect(doorProgress(show(30, 20), 50)).toEqual({ admitted: 50, sold: 50, percent: 100 })
  })

  it('clamps admitted to sold so the ring never overflows', () => {
    // more scanned than sold (data hiccup) must not exceed 100%
    expect(doorProgress(show(10, 0), 99)).toEqual({ admitted: 10, sold: 10, percent: 100 })
  })

  it('clamps a negative scanned count to zero', () => {
    expect(doorProgress(show(10, 0), -3)).toEqual({ admitted: 0, sold: 10, percent: 0 })
  })

  it('reports 0% with zero sold without dividing by zero', () => {
    expect(doorProgress(show(0, 0), 0)).toEqual({ admitted: 0, sold: 0, percent: 0 })
  })
})
