// The three rules the performance detail screen needs and the page cannot own
// (#457, ADR-0024).
//
// `/app/izvedba/[id]` is one screen with three segments — Dolaze, Postava,
// Ulaznice — and each of those asks a question that is a fact about the data
// rather than about the markup: which segment the URL opened on, how the postava
// is ordered, and why there are no tickets to issue. All three live here, pure
// and unit-tested, so the page renders the answer instead of deciding it.
//
// Nothing in this file loads anything. `detail-loaders.ts` still owns what the
// page reads; this owns how the read is presented.

import type { DanceRole } from '@/lib/moreskant-profile'
import type { LineupRow } from './detail-loaders'

/** The three segments, in tab order. */
export const DETAIL_SEGMENTS = ['dolaze', 'postava', 'ulaznice'] as const

export type DetailSegment = (typeof DETAIL_SEGMENTS)[number]

/**
 * Which segment `?dio=` asks for, defaulting to Dolaze.
 *
 * A push notification deep-links into a segment ("postava je potvrđena" lands on
 * Postava, #431), so the parameter is part of the contract with the notification
 * text and not merely a convenience. Anything unrecognised opens on Dolaze
 * rather than erroring: a stale link from an old push is still a link to the
 * evening.
 */
export function parseSegment(raw: string | undefined | null): DetailSegment {
  return DETAIL_SEGMENTS.includes(raw as DetailSegment) ? (raw as DetailSegment) : 'dolaze'
}

/**
 * The order the postava is read in: the named roles first, then the two armies.
 *
 * The same order `compareLineupRows` sorts by, spelled as sections: "am I kralj
 * tonight" is answered by the top of the screen.
 */
export const LINEUP_ROLE_ORDER: readonly DanceRole[] = [
  'crni_kralj',
  'bili_kralj',
  'otmanovic',
  'bula',
  'crni',
  'bili',
]

/**
 * The four roles an evening has exactly one of (or none), which are listed even
 * when nobody holds them: an empty Crni kralj row is the point, because a
 * postava missing its king is the thing a dancer scanning the list must see.
 */
const SPECIAL_ROLES: readonly DanceRole[] = ['crni_kralj', 'bili_kralj', 'otmanovic', 'bula']

export interface LineupRoleGroup {
  role: DanceRole
  entries: LineupRow[]
}

/**
 * Group a confirmed postava into role sections, in {@link LINEUP_ROLE_ORDER}.
 *
 * A special role with nobody in it still gets a section, so the gap is visible;
 * an empty plain army does not, because "no crni at all" is not a gap, it is an
 * evening that was never going to have one and a heading over nothing.
 */
export function groupLineupByRole(entries: readonly LineupRow[]): LineupRoleGroup[] {
  const byRole = new Map<DanceRole, LineupRow[]>()
  for (const entry of entries) {
    const list = byRole.get(entry.role)
    if (list) list.push(entry)
    else byRole.set(entry.role, [entry])
  }

  const out: LineupRoleGroup[] = []
  for (const role of LINEUP_ROLE_ORDER) {
    const list = byRole.get(role) ?? []
    if (list.length === 0 && !SPECIAL_ROLES.includes(role)) continue
    out.push({ role, entries: list })
  }
  return out
}

/** Why the Ulaznice segment has no form. One key per sentence the page prints. */
export type CompUnavailableReason = 'private' | 'cancelled' | 'past' | 'noMember'

export interface CompPerformanceFacts {
  isPublic: boolean
  cancelled: boolean
  /** Epoch ms of the start instant; NaN when the row has no usable time. */
  startMs: number
}

/**
 * Why this evening issues no free tickets, or null when it does.
 *
 * The four cases are exactly the four conditions `buildCompView` ANDs into
 * `visible`, read back out one at a time: the section a dancer sees hidden and
 * the sentence explaining it are the same rule, so the screen never says "nema
 * ulaznica" for a reason the loader did not actually apply.
 */
export function compUnavailableReason(
  performance: CompPerformanceFacts,
  myMemberId: string | null,
  nowMs: number,
): CompUnavailableReason | null {
  if (!performance.isPublic) return 'private'
  if (performance.cancelled) return 'cancelled'
  if (Number.isNaN(performance.startMs) || performance.startMs <= nowMs) return 'past'
  if (myMemberId == null) return 'noMember'
  return null
}

const CONFIRMED_AT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zagreb',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * "12. 9. u 16:40" — when the postava was locked.
 *
 * Zagreb wall clock, because the voditelj who pressed Potvrdi and the dancer
 * reading it are standing in the same town; the stored instant is UTC.
 */
export function formatConfirmedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = CONFIRMED_AT.formatToParts(d)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  // Intl pads every numeric field once any of them asks for two digits, and a
  // date is written "12. 9." in Croatian, never "12. 09.". The clock keeps its
  // padding, which is how a clock is written.
  const plain = (value: string) => String(Number(value))
  return `${plain(part('day'))}. ${plain(part('month'))}. u ${part('hour')}:${part('minute')}`
}
