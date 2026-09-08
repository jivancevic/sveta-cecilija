import { describe, expect, it } from 'vitest'
import {
  buildIcs,
  escapeIcsText,
  eventTitle,
  foldIcsLine,
  sequenceOf,
  type CalendarPerformance,
} from './ics'

// #433 — the feed as a calendar client reads it: the text, not the object.

const NOW = Date.UTC(2026, 6, 1, 12, 0)

function performance(overrides: Partial<CalendarPerformance> = {}): CalendarPerformance {
  return {
    id: '7',
    date: '2026-08-05',
    time: '21:00',
    kind: 'redovna',
    isPublic: true,
    venue: 'ljetno-kino',
    location: null,
    cancelled: false,
    voditeljNote: null,
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

/** The unfolded property values, so an assertion reads like the file does. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n')
}

describe('buildIcs', () => {
  it('wraps the events in a calendar a client will accept', () => {
    const out = lines(buildIcs([performance()], NOW))
    expect(out[0]).toBe('BEGIN:VCALENDAR')
    expect(out).toContain('VERSION:2.0')
    expect(out).toContain('X-WR-CALNAME:Moreška')
    expect(out.at(-2)).toBe('END:VCALENDAR')
    // RFC 5545 wants CRLF endings and a final one.
    expect(buildIcs([], NOW).endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('gives a performance a UID that survives a reschedule', () => {
    const before = lines(buildIcs([performance()], NOW))
    const after = lines(buildIcs([performance({ date: '2026-08-09' })], NOW))
    expect(before).toContain('UID:performance-7@moreska.eu')
    expect(after).toContain('UID:performance-7@moreska.eu')
  })

  it('writes the Zagreb wall clock as UTC, in summer and in winter', () => {
    // 21:00 CEST is 19:00Z.
    expect(lines(buildIcs([performance()], NOW))).toContain('DTSTART:20260805T190000Z')
    // After the October switch the same wall clock is 20:00Z.
    expect(
      lines(buildIcs([performance({ date: '2026-11-10' })], NOW)),
    ).toContain('DTSTART:20261110T200000Z')
  })

  it('makes every performance one hour long', () => {
    const out = lines(buildIcs([performance()], NOW))
    expect(out).toContain('DTSTART:20260805T190000Z')
    expect(out).toContain('DTEND:20260805T200000Z')
  })

  it('carries no alarm: the app is the reminder', () => {
    expect(buildIcs([performance()], NOW)).not.toContain('VALARM')
  })

  it('bumps SEQUENCE when the row is saved again', () => {
    const first = sequenceOf('2026-07-01T10:00:00.000Z')
    const second = sequenceOf('2026-07-02T10:00:00.000Z')
    expect(second).toBeGreaterThan(first)
    expect(lines(buildIcs([performance()], NOW))).toContain(`SEQUENCE:${first}`)
    expect(sequenceOf(null)).toBe(0)
  })

  it('keeps a cancelled performance in the feed, struck through', () => {
    expect(lines(buildIcs([performance({ cancelled: true })], NOW))).toContain('STATUS:CANCELLED')
    expect(lines(buildIcs([performance()], NOW))).toContain('STATUS:CONFIRMED')
  })

  it('titles a public row by its venue and a booking by its location', () => {
    expect(eventTitle(performance())).toBe('Moreška: Redovna, Ljetno kino')
    expect(
      eventTitle(
        performance({ kind: 'dmc', isPublic: false, venue: null, location: 'Sv. Justina' }),
      ),
    ).toBe('Moreška: Adriatic DMC, Sv. Justina')
    expect(eventTitle(performance({ isPublic: false, venue: null, location: null }))).toBe(
      'Moreška: Redovna',
    )
  })

  it('puts the place and the note in the description', () => {
    const out = lines(buildIcs([performance({ voditeljNote: 'Nađemo se na molu' })], NOW))
    expect(out).toContain('DESCRIPTION:Ljetno kino\\nNađemo se na molu')
    expect(out).toContain('LOCATION:Ljetno kino')
  })

  it('escapes a note that would otherwise split the property', () => {
    const out = lines(
      buildIcs([performance({ voditeljNote: 'molo, 9:30; bijele košulje\nponesi mač' })], NOW),
    )
    expect(out).toContain(
      'DESCRIPTION:Ljetno kino\\nmolo\\, 9:30\\; bijele košulje\\nponesi mač',
    )
  })

  it('drops a row whose start cannot be read rather than writing NaN', () => {
    const out = buildIcs([performance({ date: 'nije datum' }), performance({ id: '8' })], NOW)
    expect(out).not.toContain('NaN')
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })
})

describe('the RFC 5545 mechanics', () => {
  it('escapes backslashes, semicolons, commas and newlines', () => {
    expect(escapeIcsText('a\\b;c,d\r\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })

  it('folds a long line at 75 octets, counting bytes and not letters', () => {
    const folded = foldIcsLine(`DESCRIPTION:${'č'.repeat(80)}`)
    for (const line of folded.split('\r\n')) {
      expect(Buffer.from(line, 'utf8').length).toBeLessThanOrEqual(75)
    }
    // Nothing is lost and no character is cut in half.
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'č'.repeat(80)}`)
  })

  it('leaves a short line alone', () => {
    expect(foldIcsLine('STATUS:CONFIRMED')).toBe('STATUS:CONFIRMED')
  })
})
