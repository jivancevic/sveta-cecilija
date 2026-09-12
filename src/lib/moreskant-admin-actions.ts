// Where the invitation meets the Members admin UI (#424, ADR-0024).
//
// One edit-menu item, "Pošalji pozivnicu", on the Members edit view. It is the
// mirror of `salesActionsVisible` on Shows: a pure rule, importable from both a
// 'use client' component and a test, and re-applied server-side by the route it
// calls (`requirePermission(req, 'moreska')`), because an admin menu is UX and
// never a security boundary.

/** The permission the action belongs to. Vocabulary: lib/access/permissions.ts. */
const MORESKA: string = 'moreska'

export interface InviteActionVisibleInput {
  /** `useDocumentInfo().collectionSlug` — the item is registered on Members. */
  collectionSlug?: string | null
  /** `useDocumentInfo().id` — absent while the document has never been saved. */
  id?: string | number | null
  /** Live form value if the form is mounted, else the saved document's value. */
  isMoreskant?: unknown
  /**
   * `useAuth().user.permissions`, when the client can see it.
   *
   * It usually cannot: `Users.permissions` is field-locked to `users` and
   * Payload's `/api/users/me` runs with `overrideAccess: false`, so a voditelj's
   * own client user carries NO permission set. Absent therefore means "unknown"
   * and cannot be treated as "denied", or the item would be invisible to the
   * very people it is for.
   */
  permissions?: unknown
}

/**
 * Should "Pošalji pozivnicu" render?
 *
 * On a saved Members document whose `isMoreskant` is true, for a viewer who is
 * not known to lack `moreska`.
 *
 * The `isMoreskant` test is what hides the item from the ticketing backoffice,
 * and it is stronger than it looks: the six moreškant fields lock **read** to
 * `moreska` (#420), so a `tickets`-only account never receives the value at all
 * and the item stays hidden for want of a `true`. The permission list is the
 * belt to that pair of braces, applied only when the client actually has one.
 */
export function inviteActionVisible(input: InviteActionVisibleInput): boolean {
  if (input.collectionSlug !== 'members') return false
  if (input.id === null || input.id === undefined || input.id === '') return false
  if (Array.isArray(input.permissions) && !input.permissions.includes(MORESKA)) return false
  return input.isMoreskant === true
}

export interface InviteAllActionVisibleInput {
  /** `useListQuery().collectionSlug` — the item is registered on Members. */
  collectionSlug?: string | null
  /** `useListQuery().data?.docs`, the rows this account actually received. */
  docs?: unknown
  /** `useAuth().user.permissions`, when the client can see it. See above. */
  permissions?: unknown
}

/**
 * Should "Pošalji pozivnice svima" render on the Members LIST (#462)?
 *
 * The list has no document to read `isMoreskant` off, so the same signal is
 * taken from the ROWS: `isMoreskant` locks READ to `moreska` (#420), so a
 * `tickets`-only account — which also sees this list, for comp attribution —
 * receives docs with no such key at all and the action stays hidden. A voditelj
 * receives the key on every row and sees it.
 *
 * An empty list therefore hides the action too, which is right: there is nobody
 * to invite. And as ever this is UX — `/api/app/invite/all` re-checks `moreska`
 * server-side.
 */
export function inviteAllActionVisible(input: InviteAllActionVisibleInput): boolean {
  if (input.collectionSlug !== 'members') return false
  if (Array.isArray(input.permissions) && !input.permissions.includes(MORESKA)) return false
  if (!Array.isArray(input.docs)) return false
  return input.docs.some(
    (doc) => doc != null && typeof doc === 'object' && 'isMoreskant' in (doc as object),
  )
}
