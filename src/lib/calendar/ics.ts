// The season as an ICS feed (#433, glossary: *Calendar feed*).
//
// One pure function from a list of performances to the text a calendar client
// downloads. No IO, no clock of its own (the caller passes `nowMs` for
// DTSTAMP), so every rule below is table-tested in `ics.test.ts`.
//
// Four decisions are baked into the output and each of them is a promise to a
// calendar client that has already subscribed:
//
//   - The UID is `performance-<id>@moreska.eu` and never changes. A UID is how
//     a client recognises an event it already has, so a UID derived from the
//     date would turn every reschedule into a duplicate entry.
//   - Times are written as UTC (`...Z`), converted through the Europe/Zagreb
//     helper (`zagreb-time.ts`), not as floating local times with a VTIMEZONE
//     block. Both are legal; UTC is the one that cannot be misread by a client
//     that ignores or mis-parses the timezone definition, and the conversion is
//     the same one `/app` and the alarm already use, DST and all.
//   - SEQUENCE comes from the row's `updatedAt`, so any save bumps it and a
//     client accepts the new version. (RFC 5545 wants a monotonically
//     increasing integer; epoch SECONDS is monotonic and fits a 32-bit signed
//     int until 2038.)
//   - A cancelled performance stays in the feed with `STATUS:CANCELLED` rather
//     than disappearing. A vanished event is silently dropped by some clients
//     and left in place by others; a cancelled one is struck through in both.
//
// There is no VALARM: the app's push is the reminder, and a calendar that
// buzzes on its own would be a second, unmutable one (#430, story 44).

import { KIND_LABELS } from '@/lib/app/strings'
import { performancePlace } from '@/lib/app/performance-place'
import type { PerformanceFacts } from '@/lib/app/performance-facts'
import { showStartMs } from '@/lib/show-time'

/**
 * One row of the feed: the SAME facts the change notification diffs
 * (`performance-facts.ts`), of which only this consumer reads `updatedAt` — it
 * drives SEQUENCE.
 */
export type CalendarPerformance = PerformanceFacts

/** Every performance is one hour in the calendar (#430, story 44). */
export const EVENT_DURATION_MS = 60 * 60 * 1000

export const CALENDAR_NAME = 'Moreška'
const PRODID = '-//HGD Sveta Cecilija//Moreskant//HR'
const UID_DOMAIN = 'moreska.eu'

/** RFC 5545 §3.3.5: 20260805T190000Z. */
export function icsUtcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * RFC 5545 §3.3.11 text escaping: backslash, semicolon and comma are escaped,
 * newlines become a literal `\n`, and a carriage return is dropped.
 *
 * A voditelj note is free text typed on a phone, so all four cases are real:
 * "nađemo se na molu u 9:30, ponesite bijele košulje" carries a comma that
 * would otherwise split the property value into two.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\\n')
}

/**
 * RFC 5545 §3.1 content lines are folded at 75 OCTETS, not characters.
 *
 * Croatian is full of multi-byte letters (č, ć, š, ž, đ), so folding by string
 * length would produce lines over the limit and, worse, could split a
 * character in half. Continuation lines start with one space.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line

  const out: string[] = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Never cut inside a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--
    out.push(bytes.subarray(start, end).toString('utf8'))
    start = end
    limit = 74 // the leading space of a continuation line counts
  }
  return out.join('\r\n ')
}

/** "Moreška: Redovna, Ljetno kino" (#430, story 44). */
export function eventTitle(performance: CalendarPerformance): string {
  const kind = KIND_LABELS[performance.kind] ?? performance.kind
  const place = performancePlace(performance)
  return place ? `${CALENDAR_NAME}: ${kind}, ${place}` : `${CALENDAR_NAME}: ${kind}`
}

/** The place, then the voditelj note. Empty when there is neither. */
export function eventDescription(performance: CalendarPerformance): string {
  return [performancePlace(performance), performance.voditeljNote?.trim() || '']
    .filter((part) => part !== '')
    .join('\n')
}

/** Epoch seconds of the last save, or 0 for a row that has never been touched. */
export function sequenceOf(updatedAt: string | null): number {
  const ms = updatedAt ? Date.parse(updatedAt) : Number.NaN
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000)
}

function line(name: string, value: string): string {
  return foldIcsLine(`${name}:${value}`)
}

function event(performance: CalendarPerformance, nowMs: number): string[] {
  const start = showStartMs(performance.date, performance.time)
  const rows = [
    'BEGIN:VEVENT',
    line('UID', `performance-${performance.id}@${UID_DOMAIN}`),
    line('DTSTAMP', icsUtcStamp(nowMs)),
    line('DTSTART', icsUtcStamp(start)),
    line('DTEND', icsUtcStamp(start + EVENT_DURATION_MS)),
    line('SUMMARY', escapeIcsText(eventTitle(performance))),
    line('SEQUENCE', String(sequenceOf(performance.updatedAt))),
    line('STATUS', performance.cancelled ? 'CANCELLED' : 'CONFIRMED'),
  ]
  const place = performancePlace(performance)
  if (place) rows.push(line('LOCATION', escapeIcsText(place)))
  const description = eventDescription(performance)
  if (description) rows.push(line('DESCRIPTION', escapeIcsText(description)))
  rows.push('END:VEVENT')
  return rows
}

/**
 * The whole feed. Performances with an unparseable start are dropped rather
 * than written as `NaN`: one bad row must not make the file unreadable.
 */
export function buildIcs(
  performances: readonly CalendarPerformance[],
  nowMs: number = Date.now(),
): string {
  const rows = [
    'BEGIN:VCALENDAR',
    line('PRODID', PRODID),
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    line('X-WR-CALNAME', escapeIcsText(CALENDAR_NAME)),
    'X-WR-TIMEZONE:Europe/Zagreb',
  ]
  for (const performance of performances) {
    if (Number.isNaN(showStartMs(performance.date, performance.time))) continue
    rows.push(...event(performance, nowMs))
  }
  rows.push('END:VCALENDAR')
  // CRLF and a trailing one: RFC 5545 §3.1, and some clients are strict.
  return `${rows.join('\r\n')}\r\n`
}
