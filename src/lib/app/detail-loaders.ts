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
  roleWarnings,
  type LineupEntry,
  type RoleWarning,
} from '@/lib/lineup/rules'
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
 * Entries and the picker are ordered by the roster itself (nickname, Croatian
 * collation), so a lineup reads the same way twice running and adding somebody
 * does not shuffle the list under the voditelj's thumb.
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
  const order = new Map(roster.map((m, i) => [String(m.id), i]))
  stored.sort(
    (a, b) => (order.get(a.memberId) ?? Infinity) - (order.get(b.memberId) ?? Infinity),
  )

  const toRow = (entry: LineupEntry): LineupRow => ({
    memberId: entry.memberId,
    nickname: label.get(entry.memberId) ?? `#${entry.memberId}`,
    role: entry.role,
  })

  const visible = input.voditelj || confirmed

  return {
    confirmed,
    confirmedAt,
    // A dancer looking at a draft gets an EMPTY list rather than a hidden
    // section: the shape of the payload is where story 34 is enforced, so no
    // template can leak a draft by forgetting a condition.
    entries: visible ? stored.map(toRow) : [],
    suggested: input.voditelj
      ? buildLineupFromAttendance(input.attendanceRows, roster).map(toRow)
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

  const myAnswer = input.viewer.memberId
    ? (rows.find((r) => r.memberId === input.viewer.memberId)?.status ?? null)
    : null

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
    performance: { ...performance, myAnswer, canAnswer },
    count,
    voditelj: input.viewer.voditelj,
    canEditOthers: input.viewer.voditelj,
    canAlarm,
    moveTargets,
    myMemberId: input.viewer.memberId,
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
  viewer: { memberId: string | null; voditelj: boolean }
  now?: () => Date
}

export async function loadPerformanceDetail(
  performanceId: string,
  deps: PerformanceDetailDeps,
): Promise<PerformanceDetail | null> {
  const performanceDoc = await deps.loadPerformance(performanceId)
  if (!performanceDoc) return null

  const [attendanceDocs, memberDocs, lineupDocs] = await Promise.all([
    deps.loadAttendance(performanceId),
    deps.loadMoreskanti(),
    deps.loadLineup?.(performanceId) ?? Promise.resolve([]),
  ])

  return buildPerformanceDetail({
    performanceDoc,
    attendanceDocs,
    memberDocs,
    lineupDocs,
    viewer: deps.viewer,
    nowMs: (deps.now?.() ?? new Date()).getTime(),
  })
}
