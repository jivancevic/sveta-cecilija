// The lineup rules (#432, ADR-0024 phase 4). Glossary: CONTEXT.md → *Lineup
// (postava)*.
//
// A lineup is who danced which dance role at one performance: exactly one role
// per member, entered before or after the evening, and CONFIRMED by a voditelj
// to become final. Only confirmed lineups feed the statistics (#437), which is
// why the confirmation flag lives on the performance rather than on a row: one
// evening is confirmed or it is not.
//
// Three rules live here, pure and unit-tested, because each of them is a
// sentence the app says in two places at once (the editor and the route):
//
//   1. buildLineupFromAttendance — "Napravi iz prisutnosti" (story 27). The
//      dancer's PRIMARY ROLE is the suggestion, and an assigned army overrides
//      it only when the two CONTRADICT each other.
//
//      Story 27 reads "their primary role, or the army I already assigned", and
//      taken literally that would demote every king in the roster: an
//      attendance row's `army` is DERIVED from the primary role when the answer
//      is created (`attendance/rules.ts`), so a stored `crni` against a
//      `crni_kralj` profile is not a decision anybody made. Only an army that
//      disagrees with the primary role proves the voditelj acted — that is the
//      "Prebaci u ..." control, and then the plain role of the new army wins.
//      A bula carries no army at all and always keeps their own role.
//   2. roleWarnings — a role outside the member's profile is a WARNING and
//      never a block (story 29): a bula danced by a crni in an emergency has to
//      be recordable as it happened.
//   3. validateLineupEntries — the two things that are nonsense rather than
//      unusual: a role outside the vocabulary, and a member listed twice
//      (story 30, "statistics never double count").
//
// No IO, no Payload, no dates.

import {
  ARMY_OF_ROLE,
  DANCE_ROLE_LABELS,
  isDanceRole,
  type DanceRole,
} from '@/lib/moreskant-profile'
import type { Army, AttendanceMember } from '@/lib/attendance/rules'
import type { AttendanceRow } from '@/lib/attendance/army-count'

/** One line of a lineup: this member danced this role. */
export interface LineupEntry {
  memberId: string
  role: DanceRole
}

/** The plain army role each army maps to, for a dancer whose army is assigned. */
const ROLE_OF_ARMY: Record<Army, DanceRole> = {
  crni: 'crni',
  bili: 'bili',
}

/**
 * The role a "dolazim" answer suggests (story 27: "their primary role, or the
 * army I already assigned").
 *
 * The primary role is the default, and it is what a king or an otmanović keeps:
 * an attendance row's army is DERIVED from the primary role on create
 * (`rules.ts`), so a stored `crni` against a `crni_kralj` profile is not a
 * decision anybody made and must not demote the king to a plain crni.
 *
 * An army that CONTRADICTS the primary role is a decision: the voditelj moved
 * this dancer across for this evening (the "Prebaci u ..." control), so the
 * plain role of that army wins. A bula carries no army at all and therefore
 * always falls through to their primary role, which is `bula`.
 *
 * A profile with no usable primary role (a row saved before it was required)
 * falls back to the assigned army's plain role, and to `crni` when there is not
 * even that — a suggestion the voditelj can change in one tap, never a refusal.
 */
export function suggestedRole(member: AttendanceMember, army: Army | null): DanceRole {
  const primary = isDanceRole(member.primaryRole) ? member.primaryRole : null
  if (primary && (army === null || ARMY_OF_ROLE[primary] === army)) return primary
  if (army) return ROLE_OF_ARMY[army]
  return primary ?? 'crni'
}

/**
 * "Napravi iz prisutnosti" (story 27).
 *
 * Every dancer who answered `coming` becomes one entry, in the order the roster
 * itself is in (the caller sorts it), with the role {@link suggestedRole}
 * picks. `not_coming` and no-answer are excluded: the button starts the
 * voditelj from the truth of the answers, not from the whole roster.
 *
 * Rows whose member is not on the roster handed in (a dancer retired after
 * answering) are ignored, the same rule `countArmies` follows.
 */
export function buildLineupFromAttendance(
  rows: readonly AttendanceRow[],
  roster: readonly AttendanceMember[],
): LineupEntry[] {
  const coming = new Map<string, Army | null>()
  for (const row of rows) {
    if (row.status !== 'coming') continue
    coming.set(String(row.memberId), row.army ?? null)
  }

  const out: LineupEntry[] = []
  for (const member of roster) {
    const id = String(member.id)
    if (!coming.has(id)) continue
    out.push({ memberId: id, role: suggestedRole(member, coming.get(id) ?? null) })
  }
  return out
}

/**
 * The order a postava is read in (#442 review): the named parts first, then the
 * two armies.
 *
 * "Am I kralj tonight" is the question a dancer opens the page with, so the
 * kings and the otmanović belong at the top rather than wherever the alphabet
 * puts their nickname — which is also the order the paper list on the pier is
 * written in. Within one role it falls back to the nickname, so the list is
 * stable between renders.
 */
export const LINEUP_ROLE_ORDER: readonly DanceRole[] = [
  'crni_kralj',
  'otmanovic',
  'bili_kralj',
  'bula',
  'crni',
  'bili',
]

const ROLE_RANK = new Map(LINEUP_ROLE_ORDER.map((role, index) => [role, index]))

/**
 * Compare two lineup lines: role order first, then nickname (Croatian
 * collation). Shared by the voditelj's editor and the dancer's list, so the two
 * can never present one evening in two orders.
 */
export function compareLineupRows(
  a: { role: DanceRole; nickname: string },
  b: { role: DanceRole; nickname: string },
): number {
  const rank = (ROLE_RANK.get(a.role) ?? 99) - (ROLE_RANK.get(b.role) ?? 99)
  return rank !== 0 ? rank : a.nickname.localeCompare(b.nickname, 'hr')
}

/** One warning: this member's profile does not list the role they are down for. */
export interface RoleWarning {
  memberId: string
  role: DanceRole
  /** Croatian, shown inline next to the row. */
  message: string
}

/**
 * Roles outside the dancer's profile (story 29).
 *
 * A warning, never a refusal: the emergency substitution is exactly the case a
 * lineup has to be able to record. A member who is not on the roster at all
 * gets one too, since nothing can be said about a profile that is not there.
 */
export function roleWarnings(
  entries: readonly LineupEntry[],
  roster: readonly AttendanceMember[],
): RoleWarning[] {
  const byId = new Map(roster.map((m) => [String(m.id), m]))
  const out: RoleWarning[] = []
  for (const entry of entries) {
    const member = byId.get(String(entry.memberId))
    const roles = member?.roles ?? []
    if (member && roles.includes(entry.role)) continue
    const who = member?.nickname?.trim() || member?.name?.trim() || `#${entry.memberId}`
    out.push({
      memberId: String(entry.memberId),
      role: entry.role,
      message: member
        ? `${who} nema ulogu "${DANCE_ROLE_LABELS[entry.role]}" u svom profilu.`
        : `${who} nije na popisu aktivnih moreškanata.`,
    })
  }
  return out
}

/** What a bad `entries` payload is: nonsense, not an unusual evening. */
export type LineupValidation =
  | { ok: true; entries: LineupEntry[] }
  | { ok: false; error: string }

export const LINEUP_ERRORS = {
  notAList: 'Postava nije ispravno poslana.',
  badEntry: 'Svaki redak postave treba moreškanta i ulogu.',
  unknownRole: 'Nepoznata plesna uloga u postavi.',
  duplicateMember: 'Isti moreškant je u postavi dva puta.',
  unknownMember: 'Netko iz postave nije aktivan moreškant.',
} as const

/**
 * Validate and normalise the `entries` of a replace request.
 *
 * `roster` is the ACTIVE moreškanti; a member outside it is refused, because a
 * lineup naming a retired member or a comp-attribution row is a bug in the
 * caller rather than an unusual evening. That is the one place this differs
 * from {@link roleWarnings}, which only warns: the warning is about a ROLE the
 * profile lacks, the refusal about a PERSON who is not a dancer.
 */
export function validateLineupEntries(
  raw: unknown,
  roster: readonly AttendanceMember[],
): LineupValidation {
  if (!Array.isArray(raw)) return { ok: false, error: LINEUP_ERRORS.notAList }

  const known = new Set(roster.map((m) => String(m.id)))
  const seen = new Set<string>()
  const entries: LineupEntry[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') return { ok: false, error: LINEUP_ERRORS.badEntry }
    const row = item as { memberId?: unknown; role?: unknown }
    const memberId =
      typeof row.memberId === 'string'
        ? row.memberId.trim()
        : typeof row.memberId === 'number'
          ? String(row.memberId)
          : ''
    if (!memberId) return { ok: false, error: LINEUP_ERRORS.badEntry }
    if (!isDanceRole(row.role)) return { ok: false, error: LINEUP_ERRORS.unknownRole }
    if (seen.has(memberId)) return { ok: false, error: LINEUP_ERRORS.duplicateMember }
    if (!known.has(memberId)) return { ok: false, error: LINEUP_ERRORS.unknownMember }
    seen.add(memberId)
    entries.push({ memberId, role: row.role })
  }

  return { ok: true, entries }
}
