// Članovi, the list half (#511): the voditelj's roster on a phone.
//
// The Backoffice has had a Members list since #420, and it is a table: columns,
// a filter drawer, a page of rows sized for a laptop. The voditelj reads this
// one standing in a hall, looking for one dancer, so the list is a name, the
// name behind it, the role and one fact — has this person been let in yet.
//
// Pure, the shape of `inquiries-view.ts`: no Payload, no fetch. The rows arrive
// from the seam (`repo.members.listMoreskanti()`), the set of ids some login
// points at arrives with them, and everything the screen shows is derived here
// so the page is a renderer and the rules are a table in the test file.

import { ARMY_OF_ROLE, DANCE_ROLE_LABELS, type DanceRole } from '@/lib/moreskant-profile'
// The type only, from the component's own file rather than through the barrel:
// a type import is erased, so this costs the seam nothing at runtime.
import type { Army } from '@/app/app/ui/RoleMark'
import { pluralize } from './roster-loaders'
import { normaliseNickname } from './username'
import { APP_STRINGS } from './strings'

/**
 * One moreškant as the seam hands them over. The Members row, projected: the
 * moreškant half plus the two attribution fields a voditelj may read.
 *
 * `note` is deliberately absent — the attribution half is the Backoffice's
 * (ADR-0019) and this screen never shows it.
 */
export interface MemberRosterRow {
  id: string
  name: string
  nickname: string | null
  mobile: string | null
  roles: string[]
  primaryRole: string | null
  active: boolean
  /** Lives in Korčula all year (the notebook's "c"); castable off-season. */
  yearRound: boolean
  /**
   * Is this row a dancer at all (ADR-0024)?
   *
   * `listMoreskanti()` only returns rows where it is true, so on the list it
   * reads as a tautology. It is here for `byId()`, which is handed an arbitrary
   * id: a Member that is only a comp-attribution name is not this screen's, and
   * a profile write that did not check would quietly turn one into a dancer. It
   * is also what lets `memberEligibility` (#462) judge these rows, so the
   * invitation list and the join list keep one definition of "an active
   * moreškant" rather than three.
   */
  isMoreskant: boolean
}

/**
 * What the CLIENT list is handed: the roster row, projected field by field.
 *
 * ADR-0024's PII boundary is that a mobile may cross into `/app` and an e-mail
 * may not, and ADR-0028 narrowed rather than reversed it: a dancer's address is
 * their own login's, read only on their own Profil, and no roster row carries
 * one at all since `Members.email` was retired (#651).
 *
 * The projection stays, and stays explicit, because it is what keeps that true:
 * a row reaching a `'use client'` component ships in the HTML, so the list is
 * handed the nine fields it draws rather than whatever the seam happens to
 * return. `Omit<…, 'email'>` is the same set as the row today and says why.
 */
export type MemberListInput = Omit<MemberRosterRow, 'email'>

/** The nine fields the list draws. Explicit, because a spread carries anything. */
export function toMemberListInput(member: MemberRosterRow): MemberListInput {
  return {
    id: member.id,
    name: member.name,
    nickname: member.nickname,
    mobile: member.mobile,
    roles: member.roles,
    primaryRole: member.primaryRole,
    active: member.active,
    yearRound: member.yearRound,
    isMoreskant: member.isMoreskant,
  }
}

/** One line of the list. A projection, never a spread. */
export interface MemberListRow {
  id: string
  /** What the row is called: the nickname, or the real name when there is none. */
  nickname: string
  /** The real name, shown small under it. Empty when it is the same string. */
  name: string
  /** The primary role in Croatian, or "bez uloge". */
  roleLabel: string
  /**
   * The army the primary role belongs to, for the row's disc and its dot
   * (#573). Null for a dancer with no role yet, which draws the empty disc.
   */
  army: Army | null
  /** One or two letters for the disc, from the real name. */
  initials: string
  /** Does some login already point at this Member (`repo.members.idsWithLogin`)? */
  hasLogin: boolean
  active: boolean
  /** As typed on the row; the invitation deep links normalise it themselves. */
  mobile: string | null
  href: string
}

/**
 * The match key for the search box: Croatian folded to ASCII, case dropped,
 * every run of anything else collapsed to a single dash.
 *
 * It is `normaliseNickname` (#424's normaliser) rather than a second folder,
 * which is what makes "Ćiro" and "ciro" one query and "Đuro" fold to "djuro"
 * instead of losing its first letter. The dash is why a two-word query still
 * matches: "ivan mar" keys to `ivan-mar`, which is a prefix of `ivan-maric`.
 */
export function memberSearchKey(value: string | null | undefined): string {
  return normaliseNickname(value)
}

/**
 * Does this moreškant match what was typed?
 *
 * The nickname and the real name both, because a voditelj looking for somebody
 * types whichever comes to mind first. A query that folds to nothing (empty,
 * spaces, "###") filters nothing: an empty search box is not a filter.
 */
export function memberMatchesSearch(
  // Not `Pick<MemberRosterRow, ...>`: Stanje searches the same two fields over
  // its own rows, where the real name is a voditelj-only extra and null for a
  // dancer (#633). `memberSearchKey` folds a null to the empty string, so a
  // missing name simply never matches.
  member: { nickname: string | null; name: string | null },
  query: string | null | undefined,
): boolean {
  const needle = memberSearchKey(query)
  if (needle === '') return true
  return (
    memberSearchKey(member.nickname).includes(needle) ||
    memberSearchKey(member.name).includes(needle)
  )
}

/**
 * "22 moreškanta" — the count over the list.
 *
 * `pluralize` and nothing hand-written: Croatian has three plural buckets and
 * the 11-14 exception, and a screen that spells its own rule gets 12 wrong.
 */
export function foundLabel(count: number): string {
  return pluralize(count, APP_STRINGS.members.count)
}

/** The Croatian label of a dance role, or the "no role yet" word. */
export function roleLabel(role: string | null | undefined): string {
  if (typeof role !== 'string' || role === '') return APP_STRINGS.header.noRoles
  return DANCE_ROLE_LABELS[role as DanceRole] ?? role
}

/** What the row is called: the nickname a dancer is known by, else their name. */
export function shownName(member: Pick<MemberRosterRow, 'name' | 'nickname'>): string {
  return member.nickname?.trim() || member.name
}

/**
 * The army of a primary role, in the vocabulary the disc draws (#573).
 *
 * `ARMY_OF_ROLE` is the one table that knows an otmanović is a crni, and a bula
 * is in neither army there — which is right for a headcount and wrong for a
 * disc, where "bula" is a colour of its own. So the null is read back into the
 * mark's third value here, and nowhere else.
 */
export function armyOfRole(role: string | null | undefined): Army | null {
  if (typeof role !== 'string' || role === '') return null
  if (role === 'bula') return 'bula'
  return ARMY_OF_ROLE[role as DanceRole] ?? null
}

/**
 * One or two letters for the disc: the first of the first two words of the
 * name, uppercased.
 *
 * The real name rather than the nickname, because the nickname is already the
 * bold line beside it and two marks saying the same thing say nothing. A name
 * with one word gives one letter, which is what a disc should then show.
 */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part[0]!.toLocaleUpperCase('hr'))
    .join('')
}

/**
 * The three chips over the list (#573, Q37).
 *
 * A voditelj asks the roster three questions and no more: show me everyone,
 * show me who still dances, show me who cannot get in yet. "Bez prijave" is the
 * one that leads somewhere — every row under it is an invitation waiting to be
 * sent.
 */
export const MEMBER_FILTERS = ['all', 'active', 'no-login'] as const
export type MemberFilter = (typeof MEMBER_FILTERS)[number]

/** Does this row survive the chip that is on? */
export function memberMatchesFilter(
  row: Pick<MemberListRow, 'active' | 'hasLogin'>,
  filter: MemberFilter,
): boolean {
  if (filter === 'active') return row.active
  if (filter === 'no-login') return !row.hasLogin
  return true
}

/**
 * The list the screen renders: the search applied, active moreškanti first,
 * each half alphabetical by the name the row is shown under.
 *
 * **Active first rather than active only.** A retired dancer still holds a
 * login and a season's lineups, and the voditelj who retired them by accident
 * has to be able to find them again; they simply sit under everybody who still
 * dances. The order inside each half is `localeCompare(..., 'hr')`, the same
 * comparator the roster loaders use, so "Ćiro" sorts where a Croatian reader
 * looks for it.
 */
export function memberListRows(
  members: readonly MemberListInput[],
  idsWithLogin: ReadonlySet<string>,
  query: string | null | undefined,
  filter: MemberFilter = 'all',
): MemberListRow[] {
  return members
    .filter((m) => memberMatchesSearch(m, query))
    .map((m) => {
      const shown = shownName(m)
      return {
        id: m.id,
        nickname: shown,
        name: m.name === shown ? '' : m.name,
        roleLabel: roleLabel(m.primaryRole),
        army: armyOfRole(m.primaryRole),
        initials: initialsOf(m.name || shown),
        hasLogin: idsWithLogin.has(m.id),
        active: m.active,
        mobile: m.mobile,
        href: `/app/members/${m.id}`,
      }
    })
    .filter((row) => memberMatchesFilter(row, filter))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.nickname.localeCompare(b.nickname, 'hr', { sensitivity: 'base' }),
    )
}
