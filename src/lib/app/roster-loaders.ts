// What `/app` reads (#421, ADR-0024 phase 3).
//
// The roster is the one surface that deliberately sees EVERY performance of the
// season — a ship call and a Redovna are both evenings a moreškant has to turn
// up for. So this module does not filter on the public predicate; it uses it
// (`isPublicPerformance`) to decide how a row RENDERS: a public row shows its
// venue label, a non-public one its free-text location and client.
//
// Payload's local API runs with `overrideAccess: true`, so collection access
// does not scope these reads — the caller scopes them by the `/app` access
// decision (`./access.ts`). Visibility inside the app is deliberately
// society-wide: a moreškant sees the same performances a voditelj sees.
//
// Emails never appear here. `RosterPerformance` has no email field and the
// loader never selects one; `roster-loaders.test.ts` asserts it on the rendered
// payload, because the PII boundary of ADR-0024 (mobiles yes, emails no) is a
// property of the data contract, not of a template.
//
// Pure + DI in the phase 2 loader style: `splitSeasonPerformances` is where the
// time and cancellation rules live and is unit-tested directly.

import { seasonYear } from '@/lib/member/season'
import { toIsoDate } from '@/lib/to-iso-date'
import { isPublicPerformance, type PerformanceKind } from '@/lib/show-performance'
import { showStartMs } from '@/lib/show-time'
import type { ShowsFind } from '@/lib/show-loaders'
import {
  moreskantMayAnswer,
  toAttendanceMember,
  type Army,
  type AttendanceMember,
  type AttendanceStatus,
} from '@/lib/attendance/rules'
import { countArmies, type AttendanceRow } from '@/lib/attendance/army-count'
import { relationIdString } from '@/lib/payload-relation'
import { APP_STRINGS, monthLabel } from '@/lib/app/strings'
import type { Venue } from '@/lib/venues'

/** One performance card. No email, ever. */
export interface RosterPerformance {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, Europe/Zagreb wall clock */
  time: string
  kind: PerformanceKind
  isPublic: boolean
  /** Public rows only; the app renders VENUE_LABEL from it. */
  venue: Venue | null
  /** Non-public rows: the free-text place ("Le Ponant, luka"). */
  location: string | null
  /** Non-public rows: the ship or organiser behind the booking. */
  client: string | null
  cancelled: boolean
  voditeljNote: string | null
  /** Epoch ms of the start instant, Europe/Zagreb. */
  startMs: number
  /** Minimum crni / bili moreškanti for this evening (#408). */
  thresholdCrni: number
  thresholdBili: number
  /** The viewer's OWN answer, or null when they have not answered (#422). */
  myAnswer: AttendanceStatus | null
  /**
   * The army recorded on the viewer's OWN attendance row (#457), null when
   * there is no row or the row carries no army (a bula is in neither). It is a
   * fact of the answer, not of the profile: a voditelj may move a dancer for one
   * evening, and the hero chip has to say which army that evening.
   */
  myArmy: Army | null
  /** Whether the postava of this evening is confirmed (#432): a past-row badge. */
  lineupConfirmed: boolean
  /** Whether the viewer may still change that answer from the card (#422). */
  canAnswer: boolean
  /**
   * The per-army headcount chip a voditelj sees on the card (#423), or null for
   * a moreškant, who gets the numbers on the detail page instead.
   */
  chip: ArmyChip | null
}

/** The card chip: two headcounts against two thresholds, nothing else. */
export interface ArmyChip {
  crni: { count: number; threshold: number; below: boolean }
  bili: { count: number; threshold: number; below: boolean }
}

export interface SeasonPerformances {
  year: number
  upcoming: RosterPerformance[]
  past: RosterPerformance[]
  /**
   * The instant the split was taken. The page renders "za 5 dana" against it
   * rather than against its own clock: a server component may not read the wall
   * clock during render, and the honest reference point for a relative label is
   * the one the data was cut at anyway.
   */
  nowMs: number
}

/**
 * How far a cancelled performance stays visible, struck through, either side of
 * today. Outside that window it disappears: a cancellation nobody has to notice
 * any more is noise on a phone screen (#419, story 30).
 */
export const CANCELLED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function threshold(value: unknown, fallback = 8): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** One raw Payload doc → one card. */
export function toRosterPerformance(row: Record<string, unknown>): RosterPerformance {
  // `toIsoDate`, never a `String(...).slice(0, 10)`: the local API hands the
  // date over as an ISO string, but a RAW pg read of the same column hands over
  // a JS Date, whose `String()` is "Mon Jun 22 2026 …" — sliced to ten
  // characters that would look like a changed date to the #436 diff.
  const date = toIsoDate(row.date)
  const time = typeof row.time === 'string' ? row.time : ''
  const isPublic = isPublicPerformance(row)
  return {
    id: String(row.id),
    date,
    time,
    kind: (row.kind as PerformanceKind) ?? 'redovna',
    isPublic,
    venue: isPublic ? ((row.venue as Venue) ?? null) : null,
    location: isPublic ? null : text(row.location),
    client: isPublic ? null : text(row.client),
    cancelled: row.status === 'cancelled',
    lineupConfirmed: row.lineupConfirmed === true,
    voditeljNote: text(row.voditeljNote),
    startMs: date && time ? showStartMs(date, time) : Number.NaN,
    thresholdCrni: threshold(row.thresholdCrni),
    thresholdBili: threshold(row.thresholdBili),
    // Filled in by attachOwnAnswers / attachArmyChips once the viewer is known.
    myAnswer: null,
    myArmy: null,
    canAnswer: false,
    chip: null,
  }
}

/**
 * Split the season into "Nadolazeće" and "Prošle".
 *
 * The boundary is the performance's own start instant in Europe/Zagreb (date +
 * `HH:MM`), not its calendar day: tonight's 21:00 show is upcoming all
 * afternoon. There is no grace window here — unlike the buyer path
 * (`SHOW_GRACE_MS`), a dancer's evening is "past" the moment it begins.
 *
 * A cancelled performance survives only within {@link CANCELLED_WINDOW_MS} of
 * now, and stays in whichever half its start time puts it, struck through.
 * Upcoming runs soonest first; past runs most recent first, which is the order
 * anyone looking back wants.
 */
export function splitSeasonPerformances(
  rows: RosterPerformance[],
  nowMs: number,
): { upcoming: RosterPerformance[]; past: RosterPerformance[] } {
  const visible = rows.filter(
    (p) => !p.cancelled || Math.abs(p.startMs - nowMs) <= CANCELLED_WINDOW_MS,
  )
  const upcoming = visible
    .filter((p) => p.startMs >= nowMs)
    .sort((a, b) => a.startMs - b.startMs)
  const past = visible
    .filter((p) => p.startMs < nowMs)
    .sort((a, b) => b.startMs - a.startMs)
  return { upcoming, past }
}

/**
 * Fold the viewer's OWN answers into the cards (#422).
 *
 * `answers` is keyed by performance id; a missing key is "no answer", the
 * absence of a row (glossary: *Attendance*). `canAnswer` is the same sentence
 * the answer route enforces (`moreskantMayAnswer`), so the buttons a dancer sees
 * disabled are exactly the ones the server would refuse. A voditelj may answer
 * at any time, cancelled or long past (#419, story 13).
 */
export function attachOwnAnswers(
  rows: RosterPerformance[],
  answers: Map<string, AttendanceStatus>,
  nowMs: number,
  opts: { voditelj: boolean; hasMember: boolean },
  armies?: Map<string, Army>,
): RosterPerformance[] {
  return rows.map((p) => ({
    ...p,
    myAnswer: answers.get(p.id) ?? null,
    myArmy: armies?.get(p.id) ?? null,
    canAnswer: opts.hasMember && (opts.voditelj || moreskantMayAnswer(p, nowMs)),
  }))
}

/**
 * The evening the hero shows: the first upcoming one that is NOT cancelled.
 *
 * A cancelled performance still belongs in the agenda below, struck through, so
 * that a dancer who remembers an evening finds it and reads why it is gone. It
 * just must never be the thing the screen opens with: the hero answers "where
 * am I next", and "nowhere, this is off" is not that answer.
 */
export function pickNextPerformance(
  upcoming: readonly RosterPerformance[],
): RosterPerformance | null {
  return upcoming.find((p) => !p.cancelled) ?? null
}

/** One month's worth of the agenda. */
export interface MonthGroup {
  /** 1-12. */
  month: number
  year: number
  /** "Rujan", nominative: it is a heading, not part of a sentence. */
  label: string
  performances: RosterPerformance[]
}

/**
 * Group the agenda by calendar month, keeping the order it arrives in.
 *
 * The year is part of the key, not only of the label: two Septembers a year
 * apart are two sections even though the heading reads the same, and a season
 * boundary must never fold one into the other.
 */
export function groupByMonth(list: readonly RosterPerformance[]): MonthGroup[] {
  const out: MonthGroup[] = []
  const index = new Map<string, MonthGroup>()
  for (const p of list) {
    const year = Number(p.date.slice(0, 4))
    const month = Number(p.date.slice(5, 7))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue
    const key = `${year}-${month}`
    let group = index.get(key)
    if (!group) {
      group = { month, year, label: monthLabel(month), performances: [] }
      index.set(key, group)
      out.push(group)
    }
    group.performances.push(p)
  }
  return out
}

const ZAGREB_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zagreb',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Whole days from now until a start instant, counted in CALENDAR days in
 * Europe/Zagreb rather than in 24 hour buckets.
 *
 * Tonight's 21:00 show is "danas" at nine in the morning and still "danas" at
 * eight in the evening; tomorrow's is "sutra" whether it is 20 hours away or 30.
 * A 24 hour bucket would call both of those the wrong thing, and the label a
 * dancer reads is the one they would say out loud.
 */
export function daysUntil(startMs: number, nowMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0
  const day = (ms: number) => Date.parse(`${ZAGREB_DAY.format(new Date(ms))}T00:00:00.000Z`)
  return Math.round((day(startMs) - day(nowMs)) / 86_400_000)
}

/**
 * "3 izvedbe" — the count beside a month heading.
 *
 * Croatian has three plural buckets and the teens are the exception that decides
 * whether the rule was written or guessed: 11 izvedbi, 21 izvedba, 22 izvedbe.
 */
export function countLabel(count: number): string {
  const words = APP_STRINGS.home.count
  const mod100 = Math.abs(count) % 100
  const mod10 = Math.abs(count) % 10
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${words.many}`
  if (mod10 === 1) return `${count} ${words.one}`
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${words.few}`
  return `${count} ${words.many}`
}

/**
 * The per-army headcount on every card (#423, voditelj story 10): a short
 * performance has to stand out in the list, not only once you open it.
 *
 * The numbers come from `countArmies`, the single home of the counting rule —
 * this function only groups the season's rows by performance and hands each
 * bundle over, so the chip and the detail page can never disagree.
 */
export function attachArmyChips(
  rows: RosterPerformance[],
  attendance: readonly (AttendanceRow & { performanceId: string })[],
  members: readonly AttendanceMember[],
): RosterPerformance[] {
  const byPerformance = new Map<string, AttendanceRow[]>()
  for (const row of attendance) {
    const list = byPerformance.get(row.performanceId)
    if (list) list.push(row)
    else byPerformance.set(row.performanceId, [row])
  }

  return rows.map((p) => {
    const count = countArmies(byPerformance.get(p.id) ?? [], members, {
      crni: p.thresholdCrni,
      bili: p.thresholdBili,
    })
    return {
      ...p,
      chip: {
        crni: { count: count.crni.count, threshold: count.crni.threshold, below: count.crni.below },
        bili: { count: count.bili.count, threshold: count.bili.threshold, below: count.bili.below },
      },
    }
  })
}

export interface SeasonPerformancesDeps {
  find: ShowsFind
  now?: () => Date
  /** The viewer's own Members id, when the login has one. */
  memberId?: string | null
  /** True when the viewer holds `moreska`: no time lock on their own answer. */
  voditelj?: boolean
}

/**
 * Every performance of the current season (calendar year, ADR-0022's
 * definition), split into upcoming and past.
 */
export async function loadSeasonPerformances(
  deps: SeasonPerformancesDeps,
): Promise<SeasonPerformances> {
  const now = deps.now?.() ?? new Date()
  const year = seasonYear(now)

  const result = await deps.find({
    collection: 'shows',
    where: {
      and: [
        { date: { greater_than_equal: `${year}-01-01T00:00:00.000Z` } },
        { date: { less_than: `${year + 1}-01-01T00:00:00.000Z` } },
      ],
    },
    sort: 'date',
    limit: 1000,
    depth: 0,
  })

  let rows = result.docs.map(toRosterPerformance)

  // The viewer's own answers, one query for the whole season. A voditelj with no
  // Member link (a non-dancing voditelj, story 15) skips it entirely.
  const answers = new Map<string, AttendanceStatus>()
  const armies = new Map<string, Army>()
  if (deps.memberId) {
    const mine = await deps.find({
      collection: 'attendance',
      where: { member: { equals: deps.memberId } },
      limit: 1000,
      depth: 0,
    })
    for (const row of mine.docs) {
      const performance = relationIdString(row.performance)
      if (performance && (row.status === 'coming' || row.status === 'not_coming')) {
        answers.set(performance, row.status)
        if (row.army === 'crni' || row.army === 'bili') armies.set(performance, row.army)
      }
    }
  }

  rows = attachOwnAnswers(
    rows,
    answers,
    now.getTime(),
    {
      voditelj: deps.voditelj === true,
      hasMember: deps.memberId != null,
    },
    armies,
  )

  // The voditelj's headcount chips: two more queries, and only for the account
  // that has a reason to see them. A dancer gets the numbers on the detail page.
  if (deps.voditelj && rows.length > 0) {
    // Scoped to this season's performances: without the filter this reads every
    // answer ever recorded, which grows without bound one season at a time and
    // is thrown away immediately.
    const performanceIds = rows.map((p) => p.id)
    const [all, roster] = await Promise.all([
      deps.find({
        collection: 'attendance',
        where: { performance: { in: performanceIds } },
        limit: 5000,
        depth: 0,
      }),
      deps.find({
        collection: 'members',
        where: { and: [{ isMoreskant: { equals: true } }, { active: { not_equals: false } }] },
        limit: 1000,
        depth: 0,
      }),
    ])

    const attendance: (AttendanceRow & { performanceId: string })[] = []
    for (const row of all.docs) {
      const performanceId = relationIdString(row.performance)
      const memberId = relationIdString(row.member)
      if (!performanceId || !memberId) continue
      if (row.status !== 'coming' && row.status !== 'not_coming') continue
      attendance.push({
        performanceId,
        memberId,
        status: row.status,
        army: row.army === 'crni' || row.army === 'bili' ? (row.army as Army) : null,
      })
    }

    const members: AttendanceMember[] = roster.docs.map(toAttendanceMember)

    rows = attachArmyChips(rows, attendance, members)
  }

  return { year, nowMs: now.getTime(), ...splitSeasonPerformances(rows, now.getTime()) }
}
