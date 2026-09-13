// One non-public performance, as a person types it (#503, ADR-0024).
//
// A ship call reaches the schedule two ways: a voditelj adds it on their phone
// (`POST /api/app/performances`) and Claude pastes next year's calendar through
// the MCP `create_performances` tool. Those are two front doors onto one rule
// set, so the rules live here rather than in either caller — a second copy is a
// second answer to "is 2026-02-31 a day", and the one that drifts is the one
// nobody is reading when a cruise call lands on the wrong evening.
//
// Pure: no IO, no Payload, no clock. What it produces is the DATA the writer
// stores, and the writer itself stays shared too
// (`createPerformancesInBulk` in `performance-bulk-create.ts`).
//
// The messages are Croatian because both callers answer a Croatian speaker: the
// voditelj reading a refusal on their phone and the voditelj reading Claude's
// answer in a chat window are the same person.

import {
  PERFORMANCE_KINDS,
  PerformanceValidationError,
  validateAndNormalisePerformance,
  type PerformanceKind,
} from './show-performance'
import { VENUE_CAPACITY, type Venue } from './venues'

/** Every kind except `redovna`, which is public by definition and sells tickets. */
export type NonPublicKind = Exclude<PerformanceKind, 'redovna'>

export const NON_PUBLIC_KINDS = PERFORMANCE_KINDS.filter(
  (k): k is NonPublicKind => k !== 'redovna',
)

/** Long enough for "Spomenik sv. Todora, iza crkve" and nothing like a note. */
export const MAX_PLACE_LENGTH = 120

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** The two houses a public performance can be in; capacity is derived from it. */
export const VENUES = Object.keys(VENUE_CAPACITY) as Venue[]

/** One sentence per refusal, shared by the app route and the MCP tool. */
export const PERFORMANCE_INPUT_MESSAGES = {
  date: 'Datum mora biti u obliku YYYY-MM-DD.',
  noSuchDay: (date: string) => `Datum ${date} ne postoji u kalendaru.`,
  time: 'Vrijeme mora biti u obliku HH:MM.',
  redovna: 'Redovnu izvedbu se ne unosi ovdje: ona prodaje karte i unosi se u administraciji.',
  kind: (kind: string) =>
    `Nepoznata vrsta "${kind}". Dopuštene su: ${NON_PUBLIC_KINDS.join(', ')}.`,
  location: 'Upiši mjesto izvedbe, na primjer "Luka" ili "Sv. Justina".',
  tooLong: `Mjesto i naručitelj smiju imati najviše ${MAX_PLACE_LENGTH} znakova.`,
  failed: 'Izvedba nije prošla provjeru.',
  /** A public performance's house: it is what its capacity is read from. */
  venue: 'Odaberi mjesto: Ljetno kino ili Centar za kulturu.',
  publicKind: (kind: string) =>
    `Nepoznata vrsta "${kind}". Dopuštene su: ${PERFORMANCE_KINDS.join(', ')}.`,
} as const

/**
 * True only for a date that exists in the calendar.
 *
 * The shape test is not enough (#445 review): `2026-02-31` matches the regex
 * and `new Date()` happily rolls it forward to 3 March, so a mistyped ship call
 * would land in the roster on a day nobody wrote down. The round trip through
 * `Date.UTC` is what catches it — a rolled-over date no longer prints as the
 * string it came from. It also rejects month 00/13 and day 00 for free.
 */
export function isRealCalendarDay(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  )
}

/** What a caller sends: the five fields a person types, plus the optional note. */
export interface NonPublicPerformanceInput {
  date?: unknown
  time?: unknown
  kind?: unknown
  location?: unknown
  client?: unknown
  note?: unknown
}

/** The same five fields, checked and trimmed. */
export interface NonPublicPerformanceFields {
  /** `YYYY-MM-DD`, the day as a person wrote it. */
  dateStr: string
  time: string
  kind: NonPublicKind
  location: string
  /** The ship or the organiser; null when there is none. */
  client: string | null
  /** Only ever set on a create; an edit leaves the note to its own editor. */
  note: string | null
}

export type PerformanceInputResult =
  | { ok: true; fields: NonPublicPerformanceFields }
  | { ok: false; error: string }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Validate what a voditelj (or Claude) typed for ONE non-public performance.
 *
 * The kind check is split in two on purpose: `redovna` gets its own sentence
 * pointing at the backoffice, because it is the one "wrong kind" that is a
 * reasonable thing to have meant.
 */
/**
 * The day and the time, which both front doors and both kinds of performance
 * spell the same way. Stated once so a public evening cannot quietly acquire a
 * second answer to "is 2026-02-31 a day".
 */
function parseWhen(row: {
  date?: unknown
  time?: unknown
}): { ok: true; dateStr: string; time: string } | { ok: false; error: string } {
  const date = text(row.date)
  if (!DATE_RE.test(date)) return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.date }
  if (!isRealCalendarDay(date)) {
    return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.noSuchDay(date) }
  }

  const time = text(row.time)
  if (!TIME_RE.test(time)) return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.time }

  return { ok: true, dateStr: date, time }
}

export function parseNonPublicPerformance(raw: unknown): PerformanceInputResult {
  const row = (raw ?? {}) as NonPublicPerformanceInput

  const when = parseWhen(row)
  if (!when.ok) return { ok: false, error: when.error }
  const { dateStr: date, time } = when

  const kind = text(row.kind)
  if (kind === 'redovna') return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.redovna }
  if (!(NON_PUBLIC_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.kind(kind) }
  }

  const location = text(row.location)
  // The collection's own invariant (`validateAndNormalisePerformance`) says the
  // same thing in English, for the admin form. Said here first, in Croatian, so
  // the person on the pier reads a sentence about their own screen.
  if (location === '') return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.location }

  const client = text(row.client)
  if (location.length > MAX_PLACE_LENGTH || client.length > MAX_PLACE_LENGTH) {
    return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.tooLong }
  }

  const note = text(row.note)

  return {
    ok: true,
    fields: {
      dateStr: date,
      time,
      kind: kind as NonPublicKind,
      location,
      client: client === '' ? null : client,
      note: note === '' ? null : note,
    },
  }
}

/** One row for the bulk writer: the day it is for, and the document to store. */
export interface NewPerformanceRow {
  dateStr: string
  data: Record<string, unknown>
}

/**
 * The document a new non-public performance is stored as.
 *
 * Runs the collection's own invariants one more time, so the two validators can
 * never disagree about a row that reached the database: this one is about the
 * words a person typed, that one about the shape the table needs.
 */
export function newPerformanceRow(fields: NonPublicPerformanceFields): NewPerformanceRow {
  const data: Record<string, unknown> = {
    // Shows are stored at NOON UTC so the UTC calendar day is the intended day
    // whatever the server's offset (db-bootstrap.md, `toIsoDate`).
    date: `${fields.dateStr}T12:00:00.000Z`,
    time: fields.time,
    kind: fields.kind,
    isPublic: false,
    location: fields.location,
    client: fields.client,
    voditeljNote: fields.note,
    status: 'active',
    onlineSold: 0,
    inPersonSold: 0,
  }
  return { dateStr: fields.dateStr, data: validateAndNormalisePerformance(data) }
}

/**
 * The patch an EDIT writes: the schedule and the placement, nothing else.
 *
 * Not the note (it has its own editor and its own push), not `isPublic` (the
 * route refuses a public row outright rather than flipping one), not the sales
 * counters, not the status. A voditelj correcting a moved ship call changes
 * five fields, so the patch carries five.
 */
export function performanceEditPatch(fields: NonPublicPerformanceFields): {
  date: string
  time: string
  kind: NonPublicKind
  location: string
  client: string | null
} {
  return {
    date: `${fields.dateStr}T12:00:00.000Z`,
    time: fields.time,
    kind: fields.kind,
    location: fields.location,
    client: fields.client,
  }
}

// ---------------------------------------------------------------------------
// The blagajna's half: a PUBLIC performance (#502)
// ---------------------------------------------------------------------------
//
// The mirror of everything above, and deliberately in the same file: "is this a
// real day", "is this a real time" and "is this a known kind" are one answer
// each, and a second module asking them would be the second answer that drifts.
// What differs is only what a public evening IS — a house instead of a place,
// `redovna` allowed rather than refused, and no client, because nobody books a
// Redovna.
//
// It is still the ROUTE that decides who may use this (`tickets`, never
// `moreska`): a validator says what a performance is, never who may write one.

/**
 * The three fields Uredi may change on a public evening, and the patch they
 * become.
 *
 * **The date is not among them.** Moving a public evening mails every buyer and
 * reissues every ticket (#379), so it is its own named action with a preview
 * and a test send; putting it on a form beside "Vrijeme" would make the biggest
 * thing on the screen the easiest thing to do by accident. Neither is the
 * public flag, the status (Otkaži is #497's route) or a sales counter.
 */
export interface PublicPerformancePatch {
  time: string
  kind: PerformanceKind
  venue: Venue
}

/** The same three fields, plus the day a create needs. */
export interface PublicPerformanceFields extends PublicPerformancePatch {
  /** `YYYY-MM-DD`, the day as a person wrote it. */
  dateStr: string
}

export type PublicPerformanceResult =
  | { ok: true; fields: PublicPerformanceFields }
  | { ok: false; error: string }

export type PublicPerformancePatchResult =
  | { ok: true; patch: PublicPerformancePatch }
  | { ok: false; error: string }

/** Validate the three fields Uredi sends for a public performance. */
export function parsePublicPerformanceEdit(raw: unknown): PublicPerformancePatchResult {
  const row = (raw ?? {}) as { time?: unknown; kind?: unknown; venue?: unknown }

  const time = text(row.time)
  if (!TIME_RE.test(time)) return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.time }

  const kind = text(row.kind)
  if (!(PERFORMANCE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.publicKind(kind) }
  }

  const venue = text(row.venue)
  if (!(VENUES as readonly string[]).includes(venue)) {
    return { ok: false, error: PERFORMANCE_INPUT_MESSAGES.venue }
  }

  return { ok: true, patch: { time, kind: kind as PerformanceKind, venue: venue as Venue } }
}

/** Validate what the blagajna typed for ONE new public performance. */
export function parsePublicPerformance(raw: unknown): PublicPerformanceResult {
  const when = parseWhen((raw ?? {}) as { date?: unknown; time?: unknown })
  if (!when.ok) return { ok: false, error: when.error }

  const rest = parsePublicPerformanceEdit(raw)
  if (!rest.ok) return { ok: false, error: rest.error }

  return { ok: true, fields: { dateStr: when.dateStr, ...rest.patch } }
}

/**
 * The document a new public performance is stored as.
 *
 * The three sales columns are written as zeroes rather than left to the
 * column defaults, so a row created from a phone and a row created in the
 * Backoffice are the same row; `onlineSalesPaused: false` says an evening
 * starts on sale, which is the only sensible default for a row that exists to
 * sell. It runs the collection's own invariants for the same reason the
 * non-public writer does.
 */
export function newPublicPerformanceRow(fields: PublicPerformanceFields): NewPerformanceRow {
  const data: Record<string, unknown> = {
    date: `${fields.dateStr}T12:00:00.000Z`,
    time: fields.time,
    kind: fields.kind,
    isPublic: true,
    venue: fields.venue,
    status: 'active',
    onlineSold: 0,
    inPersonSold: 0,
    legacyReserved: 0,
    onlineSalesPaused: false,
  }
  return { dateStr: fields.dateStr, data: validateAndNormalisePerformance(data) }
}

export { PerformanceValidationError }
export type { Venue }
