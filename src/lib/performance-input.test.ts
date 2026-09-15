import { describe, expect, it } from 'vitest'
import {
  MAX_PLACE_LENGTH,
  NON_PUBLIC_KINDS,
  isRealCalendarDay,
  newPerformanceRow,
  newPublicPerformanceRow,
  parseNonPublicPerformance,
  parsePublicPerformance,
  parsePublicPerformanceEdit,
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

  it('never offers redovna as a kind, nor a koncert (#635)', () => {
    expect(NON_PUBLIC_KINDS).toEqual(['dmc', 'gulliver', 'experience', 'ostalo'])
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

  // #620 — a Moreška Experience is danced by three pairs, so eight a side was
  // wrong on every one ever created and the bar said "fale još 5 crnih" about
  // a morning that was full.
  it('starts a Moreška Experience at three a side', () => {
    const parsed = parseNonPublicPerformance({ ...GOOD, kind: 'experience' })
    if (!parsed.ok) throw new Error(parsed.error)
    expect(newPerformanceRow(parsed.fields).data).toMatchObject({
      thresholdCrni: 3,
      thresholdBili: 3,
    })
  })

  it('starts every other kind at eight a side', () => {
    const parsed = parseNonPublicPerformance(GOOD)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(newPerformanceRow(parsed.fields).data).toMatchObject({
      thresholdCrni: 8,
      thresholdBili: 8,
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

// ---------------------------------------------------------------------------
// The blagajna's half: a PUBLIC performance (#502)
// ---------------------------------------------------------------------------

const PUBLIC_GOOD = {
  date: '2027-07-19',
  time: '21:00',
  kind: 'redovna',
  venue: 'ljetno-kino',
}

describe('parsePublicPerformance', () => {
  it('accepts the four fields a public evening is', () => {
    const parsed = parsePublicPerformance(PUBLIC_GOOD)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.fields).toEqual({
      dateStr: '2027-07-19',
      time: '21:00',
      kind: 'redovna',
      venue: 'ljetno-kino',
    })
  })

  it('accepts `redovna`, which the voditelj’s validator refuses outright', () => {
    expect(parseNonPublicPerformance({ ...PUBLIC_GOOD, location: 'Luka' }).ok).toBe(false)
    expect(parsePublicPerformance(PUBLIC_GOOD).ok).toBe(true)
  })

  it('refuses a venue that is not one of the two houses', () => {
    const parsed = parsePublicPerformance({ ...PUBLIC_GOOD, venue: 'kino-mediteran' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toContain('Ljetno kino')
  })

  it('refuses a missing venue: a public evening has a capacity, so it has a house', () => {
    expect(parsePublicPerformance({ ...PUBLIC_GOOD, venue: '' }).ok).toBe(false)
  })

  it('reuses the same date and time rules as the booking form', () => {
    expect(parsePublicPerformance({ ...PUBLIC_GOOD, date: '2027-02-31' }).ok).toBe(false)
    expect(parsePublicPerformance({ ...PUBLIC_GOOD, time: '25:00' }).ok).toBe(false)
  })

  it('refuses an unknown kind', () => {
    expect(parsePublicPerformance({ ...PUBLIC_GOOD, kind: 'karneval' }).ok).toBe(false)
  })
})

describe('newPublicPerformanceRow', () => {
  it('stores the day at noon UTC and marks the row public and on sale', () => {
    const parsed = parsePublicPerformance(PUBLIC_GOOD)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(newPublicPerformanceRow(parsed.fields)).toEqual({
      dateStr: '2027-07-19',
      data: {
        date: '2027-07-19T12:00:00.000Z',
        time: '21:00',
        kind: 'redovna',
        isPublic: true,
        venue: 'ljetno-kino',
        status: 'active',
        onlineSold: 0,
        inPersonSold: 0,
        legacyReserved: 0,
        onlineSalesPaused: false,
      },
    })
  })
})

describe('parsePublicPerformanceEdit', () => {
  it('carries the time, the venue and the kind, and never the date', () => {
    // Moving a public evening's DATE mails every buyer and reissues every
    // ticket (#379), so it is its own named action and not a field on a form.
    const parsed = parsePublicPerformanceEdit({ ...PUBLIC_GOOD, date: '2099-01-01' })
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.patch).toEqual({
      time: '21:00',
      kind: 'redovna',
      venue: 'ljetno-kino',
    })
  })

  it('needs no date at all, because Uredi does not send one', () => {
    const parsed = parsePublicPerformanceEdit({ time: '21:00', kind: 'ostalo', venue: 'zimsko-kino' })
    expect(parsed.ok).toBe(true)
  })

  it('refuses a kind Cecilija hides, so a saved row cannot vanish (#635)', () => {
    const parsed = parsePublicPerformanceEdit({ time: '21:00', kind: 'koncert', venue: 'zimsko-kino' })
    expect(parsed.ok).toBe(false)
  })

  it('still refuses a bad time, a bad kind and a bad venue', () => {
    expect(parsePublicPerformanceEdit({ ...PUBLIC_GOOD, time: '9:00' }).ok).toBe(false)
    expect(parsePublicPerformanceEdit({ ...PUBLIC_GOOD, kind: 'karneval' }).ok).toBe(false)
    expect(parsePublicPerformanceEdit({ ...PUBLIC_GOOD, venue: 'luka' }).ok).toBe(false)
  })
})
