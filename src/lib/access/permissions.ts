/**
 * The closed permission vocabulary (ADR-0023).
 *
 * A user holds a SET of permissions instead of a single role. This module is
 * the only place the vocabulary is spelled out — never re-type the list in a
 * collection, a route or a component; import `PERMISSIONS` (or the `Permission`
 * type) from here.
 *
 * Phase 1 (#393) is an expand–contract migration: this module lands alongside
 * the existing role predicates in ./roles and gates nothing yet. #395–#398 move
 * the call sites over and delete the role predicates.
 */

export const PERMISSIONS = [
  // Manage user accounts and permission sets. The only permission that can
  // grant permissions, so "superadmin" is just "holds every permission".
  'users',
  // The ticketing backoffice: orders, shows, partners, members, promo codes.
  'tickets',
  // Issue refunds.
  'refunds',
  // Door operation: scan a ticket, look a code up, the door dashboard.
  'door',
  // A reseller login, scoped to its linked Partners record.
  'partner',
  // The shared read-only season ticket dashboard (ADR-0022).
  'season_stats',
  // Moreška roster tools (ADR-0024). In the vocabulary from phase 1 so phase 3
  // needs no second enum migration; gates nothing yet.
  'moreska',
  // A moreškant's own roster view (ADR-0024). Same: reserved, gates nothing yet.
  'moreskant',
  // Money without buyers (#476, #500): revenue collected, refunds, the partner
  // receivable and its statements, and the counts view of Statistika. Never an
  // order, never a buyer — the society's tajnik and blagajnik are different
  // people by statute, so the president reads revenue without holding
  // `tickets`.
  'finance',
  // Published content in the Backoffice (#476, #500): Objave (posts) and FAQ.
  // Carved out of `tickets`, which no longer reaches either.
  'editor',
  // Developer diagnostics: the dev strip and critical-events strip (ADR-0016).
  'dev',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * The permission sets an invitation may land on (#487, #520).
 *
 * An invitation moves a login's e-mail onto the Member's and mails or texts it
 * a sign-in link, so it may only ever be aimed at an account whose reach is a
 * dancer's. `moreskant` is that by definition; `door` is on the list because a
 * door login reaches no further than the shared `tehnika` account already does
 * — scanning tickets at the gate — and a door person who dances must hold ONE
 * account (#487), not a second one opened just to be invitable.
 *
 * Anything else (`moreska`, `tickets`, `users`, `finance`, …) is a staff
 * account, and pointing an invitation at one is account takeover: any voditelj
 * may edit a Member's e-mail. The check itself is `isDancerLogin` in
 * `src/lib/app/invite.ts`; the words live here, once, with the vocabulary.
 */
export const INVITABLE_PERMISSIONS: readonly Permission[] = ['moreskant', 'door']

/** Anything Payload might hand us as `req.user`. */
export type PermissionUser = { permissions?: unknown } | null | undefined

const KNOWN = new Set<string>(PERMISSIONS)

/** Narrows an arbitrary value to a known vocabulary word. */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && KNOWN.has(value)
}

/**
 * The user's permission set, with anything outside the vocabulary dropped.
 *
 * A permission the app does not know must be ignored rather than crash (#393,
 * story 27), so a stale or hand-edited row stays safe. Missing or malformed
 * values mean "denied" — never "everything".
 */
export function permissionsOf(user: PermissionUser): Permission[] {
  const raw = user?.permissions
  if (!Array.isArray(raw)) return []
  return raw.filter(isPermission)
}

/**
 * The single access predicate. `can(user, 'refunds')` replaces every role
 * comparison. Null/undefined user → false; empty set → false; an unknown
 * permission string → false, in the set or in the argument.
 */
export function can(user: PermissionUser, permission: Permission): boolean {
  if (!user) return false
  if (!isPermission(permission)) return false
  return permissionsOf(user).includes(permission)
}

/**
 * True when the user holds at least one of the listed permissions. An empty
 * list is false: "any of nothing" is nothing, never a wildcard.
 */
export function hasAny(user: PermissionUser, permissions: readonly Permission[]): boolean {
  if (!user) return false
  if (!Array.isArray(permissions) || permissions.length === 0) return false
  return permissions.some((p) => can(user, p))
}
