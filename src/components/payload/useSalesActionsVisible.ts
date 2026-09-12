'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { salesActionsVisible } from '@/lib/show-admin-actions'

/**
 * The one gate the five Shows edit-menu actions share (#409).
 *
 * In-person sales, view orders, move to Zimsko, reschedule and cancel all mean
 * "do something about the tickets of this show". A non-public performance has
 * none, so none of them renders on one. Each action's route re-checks the same
 * rule server-side — this hook is UX, not a security boundary.
 *
 * Reads the LIVE form value when the edit form is mounted (so unticking "Public
 * performance" removes the actions immediately, before the save), and falls
 * back to the saved document when it is not. The decision itself is the pure,
 * unit-tested `salesActionsVisible`.
 */
export function useSalesActionsVisible(): boolean {
  const { id, collectionSlug, savedDocumentData } = useDocumentInfo()
  // Outside a Form the selector context defaults to `[{}, () => null]`, so this
  // is safe to call unconditionally and simply yields undefined.
  const formIsPublic = useFormFields(([fields]) => fields?.isPublic?.value)
  const isPublic =
    formIsPublic === undefined
      ? (savedDocumentData as { isPublic?: unknown } | undefined)?.isPublic
      : formIsPublic

  return salesActionsVisible({ collectionSlug, id, isPublic })
}
