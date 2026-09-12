'use client'

import { useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { inviteActionVisible } from '@/lib/moreskant-admin-actions'

/**
 * Should "Pošalji pozivnicu" render on this Members document (#424)?
 *
 * The Members mirror of `useSalesActionsVisible`: it reads the LIVE form value
 * when the edit form is mounted (so ticking "Moreškant" reveals the action
 * before the save is even in flight, and unticking hides it) and falls back to
 * the saved document otherwise. The decision itself is the pure, unit-tested
 * `inviteActionVisible`; this hook is only Payload's plumbing.
 *
 * `useAuth().user` usually carries no `permissions` (the field is locked to
 * `users` and `/api/users/me` applies field access), which is why the pure rule
 * treats an absent list as "unknown" rather than "denied" and leans on
 * `isMoreskant` — a value a `tickets`-only account never receives either.
 * Either way this is UX: `/api/app/invite` re-checks `moreska` server-side.
 */
export function useInviteVisible(): boolean {
  const { id, collectionSlug, savedDocumentData } = useDocumentInfo()
  const { user } = useAuth()
  // Outside a Form the selector context defaults to `[{}, () => null]`, so this
  // is safe to call unconditionally and simply yields undefined.
  const formValue = useFormFields(([fields]) => fields?.isMoreskant?.value)
  const isMoreskant =
    formValue === undefined
      ? (savedDocumentData as { isMoreskant?: unknown } | undefined)?.isMoreskant
      : formValue

  return inviteActionVisible({
    collectionSlug,
    id,
    isMoreskant,
    permissions: (user as { permissions?: unknown } | null | undefined)?.permissions,
  })
}
