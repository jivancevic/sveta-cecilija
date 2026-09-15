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
import { SHOW_GRACE_MS, showStartMs } from '@/lib/show-time'
import type { ShowsFind } from '@/lib/show-loaders'
import { isLineupRole, type LineupRole } from '@/lib/moreskant-profile'
import {
  moreskantMayAnswer,
  toAttendanceMember,
  type Army,
  type AttendanceMember,
  type AttendanceStatus,
} from '@/lib/attendance/rules'
import { countArmies, type AttendanceRow } from '@/lib/attendance/army-count'
import { armyOfLineupRole, isDanceTitle, type DanceTitle } from '@/lib/lineup/titles'
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
  /**
   * The title the viewer wears in this evening's CONFIRMED postava (#566), or
   * null: no title, no postava, or one the voditelj has not confirmed yet.
   *
   * A title belongs to one performance's lineup and never to a person
   * (glossary: *Title*), which is exactly why it is a field on the performance
   * rather than on the profile. Moreška reads it off the NEXT nastup for the
   * crown on the reader's own mark, and an unconfirmed postava yields nothing:
   * a dancer must not learn they are kralj tonight from a draft the voditelj is
   * still moving around (story 34).
   */
  myTitle: DanceTitle | null
  /** Whether the viewer may still change that answer from the card (#422). */
  canAnswer: boolean
  /**
   * The per-army headcount chip a voditelj sees on the card (#423), or null for
   * a moreškant, who gets the numbers on the detail page instead.
   */
  chip: ArmyChip | null
  /**
   * The composition of the CONFIRMED postava: "7/9" on a past row (#634).
   *
   * Seven crni and nine bili, who actually danced. Deliberately a second field
   * rather than a reading of `chip`: the chip is an ATTENDANCE headcount, which
   * is who said they were coming, and the two numbers differ on most evenings.
   * A past row that says who danced must come off the postava or it is a
   * plausible lie.
   *
   * Null on every evening without a confirmed postava, past or future, which is
   * what makes the red "Nema popisa" a property of the row rather than a second
   * condition on the screen.
   */
  postava: PostavaCount | null
}

/** Who danced, per army. The bula and an Experience's voditelj are in neither. */
export interface PostavaCount {
  crni: number
  bili: number
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
    // Filled in by attachOwnAnswers / attachOwnTitles / attachArmyChips once
    // the viewer is known.
    myAnswer: null,
    myArmy: null,
    myTitle: null,
    canAnswer: false,
    chip: null,
    postava: null,
  }
}

/**
 * Split the season into "Nadolazeće" and "Prošle".
 *
 * The boundary is the performance's own start instant in Europe/Zagreb (date +
 * `HH:MM`), not its calendar day: tonight's 21:00 show is upcoming all
 * afternoon. It then stays upcoming for {@link SHOW_GRACE_MS} past that start
 * (#633), the same hour the buyer path holds a show open for, and for the same
 * kind of reason: the evening a dancer is standing at is the one evening the
 * hero is looked at, and at 21:00 sharp it used to go blank on them. The
 * constant is imported rather than re-typed so the two windows cannot drift.
 *
 * It changes only WHERE the row is drawn. Whether a dancer may still answer is
 * `moreskantMayAnswer`, which closes at the start instant with no grace, so
 * inside the hour the circles are drawn and refused rather than silently live.
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
  const stillNext = (p: RosterPerformance) => p.startMs + SHOW_GRACE_MS >= nowMs
  const upcoming = visible.filter(stillNext).sort((a, b) => a.startMs - b.startMs)
  const past = visible.filter((p) => !stillNext(p)).sort((a, b) => b.startMs - a.startMs)
  return { upcoming, past }
}

/**
 * Fold the viewer's OWN answers into the cards (#422).
 *
 * `answers` is keyed by performance id; a missing key is "no answer", the
 * absence of a row (glossary: *Attendance*). `canAnswer` is the same sentence
 * the answer route enforces (`moreskantMayAnswer`), so the buttons a dancer sees
 * disabled are exactly the ones the server would refuse.
 *
 * **A voditelj gets no bypass on their OWN row** (#627). They had one until
 * this ticket, inherited from the right to write an evening down after it
 * happened — but that right is over somebody ELSE's answer and it lives on the
 * person sheet. On their own pair a voditelj is a dancer, and a past nastup is
 * one nobody is coming to.
 */
export function attachOwnAnswers(
  rows: RosterPerformance[],
  answers: Map<string, AttendanceStatus>,
  nowMs: number,
  opts: { hasMember: boolean },
  armies?: Map<string, Army>,
): RosterPerformance[] {
  return rows.map((p) => ({
    ...p,
    myAnswer: answers.get(p.id) ?? null,
    myArmy: armies?.get(p.id) ?? null,
    canAnswer: opts.hasMember && moreskantMayAnswer(p, nowMs),
  }))
}

/**
 * Fold the viewer's OWN title into the cards (#566).
 *
 * `titles` is keyed by performance id and holds whatever the viewer's lineup
 * row says; only a title on a CONFIRMED postava survives, because an
 * unconfirmed one is a draft no dancer may read (story 34) and a plain crni is
 * not a title at all.
 */
export function attachOwnTitles(
  rows: RosterPerformance[],
  titles: Map<string, string>,
): RosterPerformance[] {
  return rows.map((p) => {
    const role = titles.get(p.id)
    return {
      ...p,
      myTitle: p.lineupConfirmed && isDanceTitle(role) ? role : null,
    }
  })
}

/** One postava row, flattened to what a count needs. */
export interface PostavaRoleRow {
  performanceId: string
  role: LineupRole
}

/**
 * Fold the confirmed postava's composition into the rows (#634).
 *
 * One pass over every lineup row of the season, keyed by performance, rather
 * than a query per evening: the season list draws forty rows and a read per row
 * is forty round trips for two digits each.
 *
 * **Only a confirmed evening gets a count.** An unconfirmed lineup is a draft
 * (story 34) and saying "7/9" off one would put a number nobody has stood
 * behind on a screen every dancer reads. A confirmed postava with nobody in an
 * army counts zero there, which is a fact and not a missing list.
 *
 * The bula is in neither number, and neither is an Experience's voditelj:
 * `armyOfLineupRole` answers 'bula' and null for those, and "7/9" is the two
 * armies (Josip: "7 crnih i 9 bilih").
 */
export function attachPostavaCounts(
  rows: RosterPerformance[],
  lineups: readonly PostavaRoleRow[],
): RosterPerformance[] {
  const counts = new Map<string, PostavaCount>()
  for (const row of lineups) {
    const army = armyOfLineupRole(row.role)
    if (army !== 'crni' && army !== 'bili') continue
    const at = counts.get(row.performanceId) ?? { crni: 0, bili: 0 }
    at[army] += 1
    counts.set(row.performanceId, at)
  }
  return rows.map((p) =>
    p.lineupConfirmed ? { ...p, postava: counts.get(p.id) ?? { crni: 0, bili: 0 } } : p,
  )
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

/**
 * The evenings the hero shows: the next one, and the one that shares its day.
 *
 * A day with two nastupa is ordinary here — an Experience in the morning and a
 * redovna at 21:00, two ship groups an hour apart — and a hero that shows only
 * the first of them asks a dancer to answer for one evening while the other
 * one, the same afternoon, is three screens away in the agenda (#591).
 *
 * **A day is a calendar day in Korčula and nothing else.** `shows.date` is a
 * `dayOnly` column already written in Europe/Zagreb, so two rows share a day
 * exactly when their `date` strings match: no clock is read here and no
 * instant is compared, which is what keeps this pure and keeps a phone in
 * another timezone from splitting an evening off its own morning.
 *
 * Capped at TWO. Three nastupa in a day happen (a festival, three Experiences)
 * and three halves on a phone is a list pretending to be a hero, so the rest
 * are a count and a way into the agenda. A cancelled row is skipped throughout,
 * for the same reason `pickNextPerformance` skips it: the hero answers "where
 * am I next", never "nowhere, this is off".
 */
export interface HeroPick {
  /** The next non-cancelled evening. */
  first: RosterPerformance
  /** The one sharing its day, when there is one. */
  second: RosterPerformance | null
  /** How many more non-cancelled evenings share that day beyond those two. */
  moreCount: number
}

export function pickHeroPerformances(upcoming: readonly RosterPerformance[]): HeroPick | null {
  const live = upcoming.filter((p) => !p.cancelled)
  const first = live[0]
  if (!first) return null
  const sameDay = live.filter((p) => p.id !== first.id && p.date === first.date)
  return {
    first,
    second: sameDay[0] ?? null,
    moreCount: Math.max(0, sameDay.length - 1),
  }
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
 * `${count} ${the right one of three Croatian plural forms}`.
 *
 * Croatian has three plural buckets and the teens are the exception that decides
 * whether the rule was written or guessed: 11 izvedbi, 21 izvedba, 22 izvedbe.
 * The rule is stated once here and every counted noun in `/app` borrows it, so
 * a second counted noun cannot quietly ship with a second, wrong rule.
 */
export function pluralize(
  count: number,
  words: { one: string; few: string; many: string },
): string {
  return `${count} ${words[pluralForm(count)]}`
}

/** Which of the three Croatian plural forms a count takes, for a label shown apart from its number. */
export function pluralForm(count: number): 'one' | 'few' | 'many' {
  const mod100 = Math.abs(count) % 100
  const mod10 = Math.abs(count) % 10
  if (mod100 >= 11 && mod100 <= 14) return 'many'
  if (mod10 === 1) return 'one'
  if (mod10 >= 2 && mod10 <= 4) return 'few'
  return 'many'
}

/** "3 izvedbe" — the count beside a month heading. */
export function countLabel(count: number): string {
  return pluralize(count, APP_STRINGS.home.count)
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
  /**
   * Whether to count the two armies per evening (`chip`). Defaults to
   * `voditelj`, which is who needed them until #565: Moreška draws the ArmyBar
   * on its hero for a DANCER too, and "are we enough tonight" is a question the
   * whole roster reads (ADR-0024, visibility is society-wide). It stays an
   * explicit flag rather than "always on" because it is two more queries, and
   * Izvedbe must not start showing headcount chips to the blagajna.
   */
  armyCounts?: boolean
  /**
   * Whether to read the confirmed postave's composition ("7/9", #634).
   *
   * One more query, and only for the screen that draws it: Moreška's past list.
   * Off everywhere else for the same reason `armyCounts` is a flag — Izvedbe
   * has no use for it and must not start paying for it.
   */
  lineupCounts?: boolean
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
  // The viewer's own lineup rows, one query for the whole season, and only for
  // a reader who has a Member row to be in a postava (#566).
  const titles = new Map<string, string>()
  if (deps.memberId) {
    const [mine, postave] = await Promise.all([
      deps.find({
        collection: 'attendance',
        where: { member: { equals: deps.memberId } },
        limit: 1000,
        depth: 0,
      }),
      deps.find({
        collection: 'lineups',
        where: { member: { equals: deps.memberId } },
        limit: 1000,
        depth: 0,
      }),
    ])
    for (const row of mine.docs) {
      const performance = relationIdString(row.performance)
      if (performance && (row.status === 'coming' || row.status === 'not_coming')) {
        answers.set(performance, row.status)
        if (row.army === 'crni' || row.army === 'bili') armies.set(performance, row.army)
      }
    }
    for (const row of postave.docs) {
      const performance = relationIdString(row.performance)
      if (performance && typeof row.role === 'string') titles.set(performance, row.role)
    }
  }

  rows = attachOwnAnswers(
    rows,
    answers,
    now.getTime(),
    { hasMember: deps.memberId != null },
    armies,
  )
  rows = attachOwnTitles(rows, titles)

  // The headcount chips: two more queries, and only for a caller that asked.
  // The voditelj's card chips (#423) and Moreška's ArmyBar (#565) are the same
  // two numbers, counted once, by the one counting rule.
  if ((deps.armyCounts ?? deps.voditelj === true) && rows.length > 0) {
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

  // The composition of a confirmed postava (#634): one query for the whole
  // season, scoped to the evenings that HAVE one, so an unconfirmed draft is
  // never read at all rather than read and then discarded.
  if (deps.lineupCounts) {
    const confirmedIds = rows.filter((p) => p.lineupConfirmed).map((p) => p.id)
    if (confirmedIds.length > 0) {
      const postave = await deps.find({
        collection: 'lineups',
        where: { performance: { in: confirmedIds } },
        limit: 5000,
        depth: 0,
      })
      const lineupRows: PostavaRoleRow[] = []
      for (const row of postave.docs) {
        const performanceId = relationIdString(row.performance)
        if (performanceId && isLineupRole(row.role)) {
          lineupRows.push({ performanceId, role: row.role })
        }
      }
      rows = attachPostavaCounts(rows, lineupRows)
    }
  }

  return { year, nowMs: now.getTime(), ...splitSeasonPerformances(rows, now.getTime()) }
}
