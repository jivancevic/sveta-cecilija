// How Korisnici reads: the row, the chips, the search (#510).
//
// The wording of a permission set is the whole screen. Eleven words that gate
// everything in this app are stored as `['tickets','refunds']`, and a list that
// printed them raw would be a screen only the developer can read — which is
// what the Backoffice already is, and the reason this screen exists.
//
// So the Croatian lives in `APP_STRINGS.users.permissionLabels`, keyed by the
// `Permission` type with `satisfies`: adding a twelfth word to the vocabulary
// fails `tsc` there until somebody writes the Croatian for it, and it can never
// ship as an unlabelled checkbox.
//
// Pure and no Payload, so the search and the fallbacks are table-tested.

import { PERMISSIONS, type Permission } from '@/lib/access/permissions'
import type { AppScreenKey } from './screens'
import { APP_STRINGS } from './strings'
import type { UsersTarget } from './users-admin'

const S = APP_STRINGS.users

/**
 * One account as the screen shows it: the row plus the two links, by NAME.
 *
 * The names are resolved inside the seam rather than by a second request per
 * row, because "Kaleta" and "Luka Brkić" are the only readable form of a
 * relation id and a list of eighteen ids helps nobody.
 */
export interface UserAccount extends UsersTarget {
  partnerId: string | null
  partnerName: string | null
  memberId: string | null
  memberName: string | null
  /**
   * The three screens this account opens on, in order (#563), or empty for the
   * generic order. Already filtered to keys the table still knows, because the
   * seam reads it through `tabKeysOf`.
   */
  tabs: AppScreenKey[]
}

export interface PermissionChip {
  key: Permission
  label: string
  hint: string
}

/** The set as chips, in the vocabulary's order so two accounts read alike. */
export function permissionChips(permissions: readonly Permission[]): PermissionChip[] {
  const held = new Set(permissions)
  return PERMISSIONS.filter((p) => held.has(p)).map((key) => ({
    key,
    label: S.permissionLabels[key],
    hint: S.permissionHints[key],
  }))
}

/**
 * The row's pills: the first few, and how many did not fit (#573, Q47).
 *
 * A superadmin holds eleven permissions, and eleven pills on a 72px row is a
 * paragraph. Three and a "+8" is the same fact at a glance, and the detail
 * behind the row is where the whole set is spelled out. The order is the
 * vocabulary's, so the three that show are the same three on every account
 * rather than whichever the database returned first.
 */
export function permissionPills(
  permissions: readonly Permission[],
  shown = 3,
): { pills: PermissionChip[]; extra: number } {
  const all = permissionChips(permissions)
  return { pills: all.slice(0, shown), extra: Math.max(0, all.length - shown) }
}

/** Every permission there is, for the checkbox list. Never a re-typed list. */
export function allPermissionChips(): PermissionChip[] {
  return permissionChips(PERMISSIONS)
}

/** The address, or the words for its absence. Never an empty cell. */
export function emailLabel(email: string | null | undefined): string {
  const value = email?.trim() ?? ''
  return value || S.noEmail
}

/**
 * Whom this login belongs to, in the order the answer is most likely to be
 * right: the name typed on the account, then the dancer it is linked to, then
 * the partner it sells for. Empty when the row is only a username, which is
 * what the shared `tehnika` login is and should stay.
 */
export function displayName(account: UserAccount): string {
  return (
    account.name?.trim() ||
    account.memberName?.trim() ||
    account.partnerName?.trim() ||
    ''
  )
}

/** "brkić" and "brkic" are the same search: a phone keyboard has no ć. */
function foldable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

/** Does this row answer what was typed in the one search box? */
export function matchesSearch(account: UserAccount, query: string): boolean {
  const needle = foldable(query.trim())
  if (!needle) return true
  const haystack = [
    account.username ?? '',
    account.name ?? '',
    account.email ?? '',
    // The dancer's name, because a moreškant's account carries none of its own.
    account.memberName ?? '',
    account.partnerName ?? '',
  ]
  return haystack.some((field) => foldable(field).includes(needle))
}

export function filterAccounts(accounts: readonly UserAccount[], query: string): UserAccount[] {
  return accounts.filter((a) => matchesSearch(a, query))
}

/** By username: the one field every account has and the one it signs in with. */
export function sortAccounts(accounts: readonly UserAccount[]): UserAccount[] {
  return [...accounts].sort((a, b) =>
    (a.username ?? '').localeCompare(b.username ?? '', 'hr', { sensitivity: 'base' }),
  )
}
