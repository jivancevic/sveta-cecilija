// One performance, in full (#423, ADR-0024 phase 3).
//
// The detail view answers one question a card cannot: are we short? So it is
// the army count (`src/lib/attendance/army-count.ts`) plus the people behind
// the numbers — nicknames per army, the bula, who said no, and who has not
// answered at all. The counting rule itself is NOT re-implemented here; this
// module loads the rows and hands them to the one function that owns it.
//
// The PII boundary of ADR-0024 lives in this file's shape: `RosterPerson`
// carries a nickname and a mobile and there is no email field to fill, so a
// dancer can call a friend and nothing else leaks. `toAttendanceMember` (in
// `attendance/rules.ts`, next to the type it builds) is an explicit projection,
// never a spread of the Payload doc.
//
// Read-only is a property of the VIEWER, not of the page: a moreškant looking
// back at last week sees the answers as they were, while a voditelj can still
// correct them (#419, story 13). Both see the same numbers.
//
// Pure + DI in the phase 2 loader style; `detail-data.ts` holds the Payload
// calls and nothing else.

import { countArmies, type ArmyCount, type AttendanceRow } from '@/lib/attendance/army-count'
import {
  allowedArmies,
  moreskantMayAnswer,
  toAttendanceMember,
  type Army,
  type AttendanceStatus,
} from '@/lib/attendance/rules'
import { relationIdString } from '@/lib/payload-relation'
import { isDanceRole, type DanceRole } from '@/lib/moreskant-profile'
import {
  buildLineupFromAttendance,
  compareLineupRows,
  roleWarnings,
  type LineupEntry,
  type RoleWarning,
} from '@/lib/lineup/rules'
import { selfCompRemaining } from '@/lib/comp/self-comp'
import { toRosterPerformance, type RosterPerformance } from './roster-loaders'

/** One line of the postava, already labelled for the screen. */
export interface LineupRow {
  memberId: string
  nickname: string
  role: DanceRole
}

/** A candidate for the "Dodaj moreškanta" picker. */
export interface LineupPerson {
  memberId: string
  nickname: string
  /** The roles their profile lists, so the select can mark the unusual ones. */
  roles: DanceRole[]
}

/**
 * The Postava section (#432).
 *
 * `visible` is the story-34 rule in one field: a moreškant sees a lineup only
 * once it is confirmed, past or future, and never a draft. `canEdit` is the
 * story-31 rule: a voditelj edits until they press Potvrdi, and the replace
 * route refuses the same case with a 409, so the read-only fields a voditelj
 * SEES and the refusal the server ENFORCES are one sentence.
 */
export interface LineupView {
  confirmed: boolean
  confirmedAt: string | null
  /** The stored postava. Empty for a dancer looking at a draft. */
  entries: LineupRow[]
  /** What "Napravi iz prisutnosti" would produce. Voditelj only. */
  suggested: LineupRow[]
  /** Roles outside a dancer's profile, for the stored entries (story 29). */
  warnings: RoleWarning[]
  /** Every active moreškant, for the picker. Voditelj only. */
  roster: LineupPerson[]
  visible: boolean
  canEdit: boolean
}

/** One of the caller's own self-issued comp orders, as the section lists it. */
export interface OwnCompOrder {
  orderId: string
  /** The short order reference, the same one printed on the slip. */
  code: string
  /** ACTIVE tickets under it: what "Moje karte" counts and a cancel frees. */
  tickets: number
  /** False once anyone has walked through the door on this order. */
  canCancel: boolean
}

/** What the loader hands `loadOwnComps` back, before the rules touch it. */
export interface OwnCompRow {
  orderId: string
  code: string | null
  tickets: number
  anyScanned: boolean
}

/**
 * The "Besplatne karte" section (#434, glossary: *Moreškant comp*).
 *
 * `visible` is story 47 in one field: a Member link, a PUBLIC performance, not
 * cancelled, still ahead. A non-public evening sells no seats at all, so there
 * is nothing to give away; a viewer with no Member link has nobody to attribute
 * a comp to, and the route refuses them for the same reason (story 55).
 */
export interface CompView {
  visible: boolean
  /**
   * Whether the room still has seats (story 47). False hides the form and says
   * so: a comp holds a real seat, so a sold-out evening has none to give, and
   * the engine would refuse the request anyway.
   */
  seatsAvailable: boolean
  /** Active tickets this dancer issued themselves here. Admin comps excluded. */
  issued: number
  /** SELF_COMP_CAP minus `issued`: what the steppers may still ask for. */
  remaining: number
  /** The default for "Ime na karti": the dancer's own full name (story 49). */
  defaultName: string
  orders: OwnCompOrder[]
}

export interface PerformanceDetail {
  performance: RosterPerformance
  count: ArmyCount
  /** True when the viewer holds `moreska`. */
  voditelj: boolean
  /**
   * True when the viewer may change ANY answer here (a voditelj, always). A
   * moreškant edits only their own, which `performance.canAnswer` decides.
   */
  canEditOthers: boolean
  /**
   * Whether the "Pošalji alarm" control belongs on this page (#431): a voditelj,
   * an evening that is neither cancelled nor already begun. The route refuses
   * the same two cases, so this only keeps the page from offering what the
   * server will decline — and it is decided HERE rather than in the component
   * because a `Date.now()` in render is an impure call the compiler rejects.
   */
  canAlarm: boolean
  /** The armies each coming dancer could be moved to. Only ever 0 or 2 entries. */
  moveTargets: Record<string, Army[]>
  /** The viewer's own Member, when they have one. */
  myMemberId: string | null
  /** The Postava section (#432). */
  lineup: LineupView
  /** The dancer's own free tickets (#434). */
  comps: CompView
  /**
   * The instant the payload was cut at (#457). The Ulaznice segment explains a
   * hidden form against it rather than reading the wall clock in render, so the
   * sentence a dancer sees and the `visible` the loader decided are answers to
   * the same question asked at the same moment.
   */
  nowMs: number
}

/**
 * The comp section, from rows already loaded.
 *
 * The cap arithmetic is NOT re-done here: `selfCompRemaining` is the same
 * function the issue route's guard measures against, so the "još N od 4" a
 * dancer reads and the 409 they would get cannot disagree.
 */
export function buildCompView(input: {
  performance: RosterPerformance
  ownComps: readonly OwnCompRow[]
  myMemberId: string | null
  myName: string | null
  /** Seats still sellable; null when they could not be read (treated as some). */
  seatsRemaining?: number | null
  nowMs: number
}): CompView {
  const upcoming = !Number.isNaN(input.performance.startMs) && input.performance.startMs > input.nowMs
  const visible =
    input.myMemberId != null &&
    input.performance.isPublic &&
    !input.performance.cancelled &&
    upcoming

  const orders = input.ownComps
    .filter((row) => row.tickets > 0)
    .map((row) => ({
      orderId: row.orderId,
      code: row.code ?? row.orderId,
      tickets: row.tickets,
      canCancel: !row.anyScanned,
    }))
  const issued = orders.reduce((sum, order) => sum + order.tickets, 0)

  return {
    visible,
    // Unknown is not "none": a seat count that could not be read must not take
    // the form away, because the sell lock is where the real refusal lives.
    seatsAvailable: input.seatsRemaining == null || input.seatsRemaining > 0,
    issued,
    remaining: selfCompRemaining(issued),
    defaultName: (input.myName ?? '').trim(),
    // A hidden section carries no orders: the payload's shape is where the rule
    // is enforced, so no template can leak one by forgetting a condition.
    orders: visible ? orders : [],
  }
}

/** A Payload attendance doc → the flat row the count reads. */
export function toAttendanceRow(doc: Record<string, unknown>): AttendanceRow | null {
  const memberId = relationIdString(doc.member)
  if (!memberId) return null
  if (doc.status !== 'coming' && doc.status !== 'not_coming') return null
  return {
    memberId,
    status: doc.status as AttendanceStatus,
    army: doc.army === 'crni' || doc.army === 'bili' ? (doc.army as Army) : null,
  }
}

/** A Payload lineups doc → the flat entry the rules read, or null for a bad row. */
export function toLineupEntry(doc: Record<string, unknown>): LineupEntry | null {
  const memberId = relationIdString(doc.member)
  if (!memberId) return null
  if (!isDanceRole(doc.role)) return null
  return { memberId, role: doc.role }
}

/**
 * The Postava section, from rows already loaded.
 *
 * The picker is ordered by nickname; the postava itself is ordered by ROLE and
 * then nickname (`compareLineupRows`), so "am I kralj tonight" is answered by
 * the top of the list and the editor and the dancer's view read alike. The
 * suggestion is built in roster order first and then sorted the same way, so
 * pressing the button twice cannot produce two orders.
 */
export function buildLineupView(input: {
  performanceDoc: Record<string, unknown>
  lineupDocs: Record<string, unknown>[]
  attendanceRows: readonly AttendanceRow[]
  members: readonly ReturnType<typeof toAttendanceMember>[]
  voditelj: boolean
}): LineupView {
  const confirmed = input.performanceDoc.lineupConfirmed === true
  const confirmedAtRaw = input.performanceDoc.lineupConfirmedAt
  const confirmedAt =
    typeof confirmedAtRaw === 'string'
      ? confirmedAtRaw
      : confirmedAtRaw instanceof Date
        ? confirmedAtRaw.toISOString()
        : null

  const roster = [...input.members].sort((a, b) =>
    (a.nickname ?? a.name ?? '').localeCompare(b.nickname ?? b.name ?? '', 'hr'),
  )
  const label = new Map(
    roster.map((m) => [String(m.id), (m.nickname ?? m.name ?? String(m.id)).trim()]),
  )

  const stored = input.lineupDocs
    .map(toLineupEntry)
    .filter((e): e is LineupEntry => e !== null)

  const toRow = (entry: LineupEntry): LineupRow => ({
    memberId: entry.memberId,
    nickname: label.get(entry.memberId) ?? `#${entry.memberId}`,
    role: entry.role,
  })
  const toRows = (entries: readonly LineupEntry[]): LineupRow[] =>
    entries.map(toRow).sort(compareLineupRows)

  const visible = input.voditelj || confirmed

  return {
    confirmed,
    confirmedAt,
    // A dancer looking at a draft gets an EMPTY list rather than a hidden
    // section: the shape of the payload is where story 34 is enforced, so no
    // template can leak a draft by forgetting a condition.
    entries: visible ? toRows(stored) : [],
    suggested: input.voditelj
      ? toRows(buildLineupFromAttendance(input.attendanceRows, roster))
      : [],
    warnings: visible ? roleWarnings(stored, roster) : [],
    roster: input.voditelj
      ? roster.map((m) => ({
          memberId: String(m.id),
          nickname: label.get(String(m.id)) ?? String(m.id),
          roles: (m.roles ?? []).filter(isDanceRole),
        }))
      : [],
    visible,
    canEdit: input.voditelj && !confirmed,
  }
}

/**
 * Everything the detail page renders, from rows already loaded.
 *
 * `members` must be the ACTIVE moreškanti and nothing else — the no-answer list
 * is that roster minus everyone who answered, which is what puts a guest
 * without a login in front of the voditelj's buttons (#419, story 19).
 */
export function buildPerformanceDetail(input: {
  performanceDoc: Record<string, unknown>
  attendanceDocs: Record<string, unknown>[]
  memberDocs: Record<string, unknown>[]
  lineupDocs?: Record<string, unknown>[]
  ownComps?: readonly OwnCompRow[]
  seatsRemaining?: number | null
  viewer: { memberId: string | null; voditelj: boolean }
  nowMs: number
}): PerformanceDetail {
  const performance = toRosterPerformance(input.performanceDoc)
  const members = input.memberDocs.map(toAttendanceMember)
  const rows = input.attendanceDocs
    .map(toAttendanceRow)
    .filter((r): r is AttendanceRow => r !== null)

  const count = countArmies(rows, members, {
    crni: performance.thresholdCrni,
    bili: performance.thresholdBili,
  })

  // The viewer's own roster row, when they are on it: the comp section defaults
  // "Ime na karti" to the name it carries (story 49).
  const me = input.viewer.memberId
    ? members.find((m) => String(m.id) === input.viewer.memberId)
    : undefined

  // The viewer's own row, once: the answer AND the army recorded on it. The
  // army is a fact of the ANSWER, not of the profile (#457) — a voditelj may
  // move a dancer for one evening, and the chip has to say which side they are
  // on that evening.
  const myRow = input.viewer.memberId
    ? (rows.find((r) => r.memberId === input.viewer.memberId) ?? null)
    : null
  const myAnswer = myRow?.status ?? null
  const myArmy = myRow?.status === 'coming' ? (myRow.army ?? null) : null

  const canAnswer =
    input.viewer.memberId != null &&
    (input.viewer.voditelj || moreskantMayAnswer(performance, input.nowMs))

  // Only a dancer who holds BOTH armies can be moved, which is the whole point
  // of the control (#419, story 12).
  const moveTargets: Record<string, Army[]> = {}
  for (const member of members) {
    const armies = allowedArmies(member)
    if (armies.length > 1) moveTargets[String(member.id)] = armies
  }

  const canAlarm =
    input.viewer.voditelj &&
    !performance.cancelled &&
    !Number.isNaN(performance.startMs) &&
    performance.startMs > input.nowMs

  return {
    performance: { ...performance, myAnswer, myArmy, canAnswer },
    count,
    voditelj: input.viewer.voditelj,
    canEditOthers: input.viewer.voditelj,
    canAlarm,
    moveTargets,
    myMemberId: input.viewer.memberId,
    nowMs: input.nowMs,
    comps: buildCompView({
      performance,
      ownComps: input.ownComps ?? [],
      myMemberId: input.viewer.memberId,
      myName: me?.name ?? me?.nickname ?? null,
      seatsRemaining: input.seatsRemaining,
      nowMs: input.nowMs,
    }),
    lineup: buildLineupView({
      performanceDoc: input.performanceDoc,
      lineupDocs: input.lineupDocs ?? [],
      attendanceRows: rows,
      members,
      voditelj: input.viewer.voditelj,
    }),
  }
}

export interface PerformanceDetailDeps {
  /** Loads one shows doc by id, or null when there is none. */
  loadPerformance: (id: string) => Promise<Record<string, unknown> | null>
  /** Every attendance row for that performance. */
  loadAttendance: (performanceId: string) => Promise<Record<string, unknown>[]>
  /** Every ACTIVE moreškant, login or not. */
  loadMoreskanti: () => Promise<Record<string, unknown>[]>
  /** Every lineup row for that performance (#432). */
  loadLineup?: (performanceId: string) => Promise<Record<string, unknown>[]>
  /** The viewer's OWN self-issued comp orders here (#434); never anyone else's. */
  loadOwnComps?: (performanceId: string, memberId: string) => Promise<OwnCompRow[]>
  /** Seats still sellable, for the comp form's sold-out line (#434). */
  loadSeatsRemaining?: (performanceId: string) => Promise<number | null>
  viewer: { memberId: string | null; voditelj: boolean }
  now?: () => Date
}

export async function loadPerformanceDetail(
  performanceId: string,
  deps: PerformanceDetailDeps,
): Promise<PerformanceDetail | null> {
  const performanceDoc = await deps.loadPerformance(performanceId)
  if (!performanceDoc) return null

  const memberId = deps.viewer.memberId
  const [attendanceDocs, memberDocs, lineupDocs, ownComps, seatsRemaining] = await Promise.all([
    deps.loadAttendance(performanceId),
    deps.loadMoreskanti(),
    deps.loadLineup?.(performanceId) ?? Promise.resolve([]),
    // Both comp reads are for the viewer's own section, so neither runs for a
    // viewer who has no Member row to issue against.
    memberId && deps.loadOwnComps
      ? deps.loadOwnComps(performanceId, memberId)
      : Promise.resolve([] as OwnCompRow[]),
    memberId && deps.loadSeatsRemaining
      ? deps.loadSeatsRemaining(performanceId)
      : Promise.resolve(null),
  ])

  return buildPerformanceDetail({
    performanceDoc,
    attendanceDocs,
    memberDocs,
    lineupDocs,
    ownComps,
    seatsRemaining,
    viewer: deps.viewer,
    nowMs: (deps.now?.() ?? new Date()).getTime(),
  })
}
