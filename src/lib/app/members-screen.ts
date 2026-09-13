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

import { DANCE_ROLE_LABELS, type DanceRole } from '@/lib/moreskant-profile'
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
  email: string | null
  roles: string[]
  primaryRole: string | null
  active: boolean
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
  member: MemberRosterRow,
  query: string | null | undefined,
): boolean {
  const needle = memberSearchKey(query)
  if (needle === '') return true
  return (
    memberSearchKey(member.nickname).includes(needle) ||
    memberSearchKey(member.name).includes(needle)
  )
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
  members: readonly MemberRosterRow[],
  idsWithLogin: ReadonlySet<string>,
  query: string | null | undefined,
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
        hasLogin: idsWithLogin.has(m.id),
        active: m.active,
        mobile: m.mobile,
        href: `/app/members/${m.id}`,
      }
    })
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.nickname.localeCompare(b.nickname, 'hr', { sensitivity: 'base' }),
    )
}
