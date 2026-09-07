// Where the "is this performance public?" rule meets the Shows admin UI and the
// admin-only show actions (#409, ADR-0024).
//
// A non-public performance (a ship call, a concert, a one-off) has no venue, no
// capacity, no buyers and no tickets, so every ticket action is meaningless on
// it: in-person sales, the orders list, the bad-weather venue move, the
// reschedule notice and the cancel notice. The admin form hides them; this
// module is the single place that decides so, and the same decision is
// re-applied inside each action's route (the admin UI is not a security
// boundary — a stale tab or a hand-built request must not email buyers of a
// performance that has none).
//
// Pure on purpose: no Payload, no React, no IO, so it is unit-testable and can
// be imported from both a server route and a 'use client' admin component.

import { isPublicPerformance } from './show-performance'

/**
 * The one message every non-public rejection uses.
 *
 * Deliberately free of the words "not found": the show routes map
 * `/not found/i` to a 404, and this is a 400 (the id resolves fine, the action
 * simply does not apply to that kind of row).
 */
export const NON_PUBLIC_PERFORMANCE_MESSAGE =
  'This is not a public performance, so ticket actions do not apply to it.'

/** Throws {@link NON_PUBLIC_PERFORMANCE_MESSAGE} unless `row` is a public performance. */
export function assertPublicPerformance(row: Record<string, unknown>): void {
  if (!isPublicPerformance(row)) throw new Error(NON_PUBLIC_PERFORMANCE_MESSAGE)
}

export interface SalesActionsVisibleInput {
  /** `useDocumentInfo().collectionSlug` — the items are registered on Shows only. */
  collectionSlug?: string | null
  /** `useDocumentInfo().id` — absent while the document has never been saved. */
  id?: string | number | null
  /** Live form value if the form is mounted, else the saved document's value. */
  isPublic?: unknown
}

/**
 * Should the five ticket actions (in-person sales, view orders, move to Zimsko,
 * reschedule, cancel) render in the edit-view menu?
 *
 * Only on a saved Shows document that is a public performance. A row carrying
 * no `isPublic` value counts as public — that is the column default and what
 * every pre-phase-2 row backfilled to.
 */
export function salesActionsVisible(input: SalesActionsVisibleInput): boolean {
  if (input.collectionSlug !== 'shows') return false
  if (input.id === null || input.id === undefined || input.id === '') return false
  return isPublicPerformance({ isPublic: input.isPublic })
}
