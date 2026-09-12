import { describe, expect, it } from 'vitest'
import {
  MAX_PLACE_LENGTH,
  NON_PUBLIC_KINDS,
  isRealCalendarDay,
  newPerformanceRow,
  parseNonPublicPerformance,
  performanceEditPatch,
} from './performance-input'

// The shared validation behind BOTH front doors onto a non-public performance
// (#503): the voditelj's form and the MCP `create_performances` tool. What is
// asserted here is what a person is allowed to type, and what the row they
// typed becomes.

const GOOD = {
  date: '2027-05-04',
  time: '10:30',
  kind: 'dmc',
  location: 'Luka',
  client: 'Le Ponant',
}

describe('isRealCalendarDay', () => {
  it('accepts a real day, leap day included', () => {
    expect(isRealCalendarDay('2027-05-04')).toBe(true)
    expect(isRealCalendarDay('2028-02-29')).toBe(true)
  })

  it('rejects a day that only looks like one', () => {
    expect(isRealCalendarDay('2026-02-31')).toBe(false)
    expect(isRealCalendarDay('2027-02-29')).toBe(false)
    expect(isRealCalendarDay('2027-13-01')).toBe(false)
    expect(isRealCalendarDay('2027-00-10')).toBe(false)
    expect(isRealCalendarDay('2027-05-00')).toBe(false)
    expect(isRealCalendarDay('4.5.2027.')).toBe(false)
  })
})

describe('parseNonPublicPerformance', () => {
  it('accepts a booking and trims what was typed', () => {
    const res = parseNonPublicPerformance({
      ...GOOD,
      location: '  Luka  ',
      client: ' Le Ponant ',
      note: ' mol u 9:30 ',
    })
    if (!res.ok) throw new Error(res.error)
    expect(res.fields).toEqual({
      dateStr: '2027-05-04',
      time: '10:30',
      kind: 'dmc',
      location: 'Luka',
      client: 'Le Ponant',
      note: 'mol u 9:30',
    })
  })

  it('reads an absent client and an absent note as null, not as empty text', () => {
    const res = parseNonPublicPerformance({ ...GOOD, client: '   ' })
    if (!res.ok) throw new Error(res.error)
    expect(res.fields.client).toBeNull()
    expect(res.fields.note).toBeNull()
  })

  it.each([
    ['a date in the wrong shape', { date: '4.5.2027.' }, 'YYYY-MM-DD'],
    ['a date nobody has', { date: '2026-02-31' }, 'ne postoji u kalendaru'],
    ['a time in the wrong shape', { time: '25:00' }, 'HH:MM'],
    ['a time that is not one', { time: 'navečer' }, 'HH:MM'],
  ])('refuses %s', (_label, patch, expected) => {
    const res = parseNonPublicPerformance({ ...GOOD, ...patch })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain(expected)
  })

  it('refuses a redovna with the sentence that points at the backoffice', () => {
    const res = parseNonPublicPerformance({ ...GOOD, kind: 'redovna' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('administraciji')
  })

  it('refuses a kind outside the vocabulary and lists the ones that are in it', () => {
    const res = parseNonPublicPerformance({ ...GOOD, kind: 'svadba' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('svadba')
    for (const kind of NON_PUBLIC_KINDS) expect(res.error).toContain(kind)
  })

  it('never offers redovna as a kind', () => {
    expect(NON_PUBLIC_KINDS).toEqual(['dmc', 'gulliver', 'koncert', 'ostalo'])
  })

  it('refuses a booking with no place, in Croatian', () => {
    const res = parseNonPublicPerformance({ ...GOOD, location: '  ' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('mjesto')
  })

  it('refuses a place or a client longer than the column is meant for', () => {
    const long = 'x'.repeat(MAX_PLACE_LENGTH + 1)
    expect(parseNonPublicPerformance({ ...GOOD, location: long }).ok).toBe(false)
    expect(parseNonPublicPerformance({ ...GOOD, client: long }).ok).toBe(false)
    expect(parseNonPublicPerformance({ ...GOOD, location: 'x'.repeat(MAX_PLACE_LENGTH) }).ok).toBe(
      true,
    )
  })

  it('refuses an empty body rather than inventing defaults', () => {
    expect(parseNonPublicPerformance(null).ok).toBe(false)
    expect(parseNonPublicPerformance({}).ok).toBe(false)
  })
})

describe('newPerformanceRow', () => {
  it('stores the day at noon UTC, non-public, active and with no seats sold', () => {
    const parsed = parseNonPublicPerformance({ ...GOOD, note: 'mol' })
    if (!parsed.ok) throw new Error(parsed.error)
    const row = newPerformanceRow(parsed.fields)

    expect(row.dateStr).toBe('2027-05-04')
    expect(row.data).toMatchObject({
      date: '2027-05-04T12:00:00.000Z',
      time: '10:30',
      kind: 'dmc',
      isPublic: false,
      location: 'Luka',
      client: 'Le Ponant',
      voditeljNote: 'mol',
      status: 'active',
      onlineSold: 0,
      inPersonSold: 0,
      // Forced by the collection's own invariant: a booking has a place, never
      // a venue, and sells nothing.
      venue: null,
      legacyReserved: 0,
    })
  })
})

describe('performanceEditPatch', () => {
  it('carries the schedule and the placement and nothing else', () => {
    const parsed = parseNonPublicPerformance({ ...GOOD, note: 'mol' })
    if (!parsed.ok) throw new Error(parsed.error)

    expect(performanceEditPatch(parsed.fields)).toEqual({
      date: '2027-05-04T12:00:00.000Z',
      time: '10:30',
      kind: 'dmc',
      location: 'Luka',
      client: 'Le Ponant',
    })
  })

  it('leaves the note, the public flag, the status and the counters alone', () => {
    const parsed = parseNonPublicPerformance({ ...GOOD, note: 'mol' })
    if (!parsed.ok) throw new Error(parsed.error)
    const keys = Object.keys(performanceEditPatch(parsed.fields))

    for (const forbidden of [
      'voditeljNote',
      'isPublic',
      'status',
      'onlineSold',
      'inPersonSold',
      'thresholdCrni',
    ]) {
      expect(keys).not.toContain(forbidden)
    }
  })
})
