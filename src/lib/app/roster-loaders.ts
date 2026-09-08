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
import { isPublicPerformance, type PerformanceKind } from '@/lib/show-performance'
import { showStartMs } from '@/lib/show-time'
import type { ShowsFind } from '@/lib/show-loaders'
import { moreskantMayAnswer, type Army, type AttendanceMember, type AttendanceStatus } from '@/lib/attendance/rules'
import { countArmies, type AttendanceRow } from '@/lib/attendance/army-count'
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
}

/**
 * How far a cancelled performance stays visible, struck through, either side of
 * today. Outside that window it disappears: a cancellation nobody has to notice
 * any more is noise on a phone screen (#419, story 30).
 */
export const CANCELLED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** The id behind a Payload relationship value, populated or not. */
export function relationIdOf(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return id == null ? null : String(id)
  }
  return String(value)
}

function threshold(value: unknown, fallback = 8): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** One raw Payload doc → one card. */
export function toRosterPerformance(row: Record<string, unknown>): RosterPerformance {
  const date = String(row.date ?? '').slice(0, 10)
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
    voditeljNote: text(row.voditeljNote),
    startMs: date && time ? showStartMs(date, time) : Number.NaN,
    thresholdCrni: threshold(row.thresholdCrni),
    thresholdBili: threshold(row.thresholdBili),
    // Filled in by attachOwnAnswers / attachArmyChips once the viewer is known.
    myAnswer: null,
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
): RosterPerformance[] {
  return rows.map((p) => ({
    ...p,
    myAnswer: answers.get(p.id) ?? null,
    canAnswer: opts.hasMember && (opts.voditelj || moreskantMayAnswer(p, nowMs)),
  }))
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
  if (deps.memberId) {
    const mine = await deps.find({
      collection: 'attendance',
      where: { member: { equals: deps.memberId } },
      limit: 1000,
      depth: 0,
    })
    for (const row of mine.docs) {
      const performance = relationIdOf(row.performance)
      if (performance && (row.status === 'coming' || row.status === 'not_coming')) {
        answers.set(performance, row.status)
      }
    }
  }

  rows = attachOwnAnswers(rows, answers, now.getTime(), {
    voditelj: deps.voditelj === true,
    hasMember: deps.memberId != null,
  })

  // The voditelj's headcount chips: two more queries, and only for the account
  // that has a reason to see them. A dancer gets the numbers on the detail page.
  if (deps.voditelj) {
    const [all, roster] = await Promise.all([
      deps.find({ collection: 'attendance', limit: 5000, depth: 0 }),
      deps.find({
        collection: 'members',
        where: { and: [{ isMoreskant: { equals: true } }, { active: { not_equals: false } }] },
        limit: 1000,
        depth: 0,
      }),
    ])

    const attendance: (AttendanceRow & { performanceId: string })[] = []
    for (const row of all.docs) {
      const performanceId = relationIdOf(row.performance)
      const memberId = relationIdOf(row.member)
      if (!performanceId || !memberId) continue
      if (row.status !== 'coming' && row.status !== 'not_coming') continue
      attendance.push({
        performanceId,
        memberId,
        status: row.status,
        army: row.army === 'crni' || row.army === 'bili' ? (row.army as Army) : null,
      })
    }

    const members: AttendanceMember[] = roster.docs.map((doc) => ({
      id: String(doc.id),
      name: typeof doc.name === 'string' ? doc.name : null,
      nickname: typeof doc.nickname === 'string' ? doc.nickname : null,
      mobile: typeof doc.mobile === 'string' ? doc.mobile : null,
      roles: Array.isArray(doc.roles) ? (doc.roles as string[]) : [],
      primaryRole: typeof doc.primaryRole === 'string' ? doc.primaryRole : null,
      active: doc.active !== false,
      isMoreskant: doc.isMoreskant === true,
    }))

    rows = attachArmyChips(rows, attendance, members)
  }

  return { year, ...splitSeasonPerformances(rows, now.getTime()) }
}
