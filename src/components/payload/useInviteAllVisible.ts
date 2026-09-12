'use client'

import { useAuth, useListQuery } from '@payloadcms/ui'
import { inviteAllActionVisible } from '@/lib/moreskant-admin-actions'

/**
 * Should "Pošalji pozivnice svima" render on this list (#462)?
 *
 * The list-view mirror of `useInviteVisible`: Payload's plumbing only, with the
 * decision itself in the pure, unit-tested `inviteAllActionVisible`. The rows
 * come from the list query because they carry the field-lock signal — a
 * `tickets`-only account receives no `isMoreskant` key — and the permission
 * list is the belt to those braces, applied only when the client has one.
 */
export function useInviteAllVisible(): boolean {
  const { collectionSlug, data } = useListQuery()
  const { user } = useAuth()

  return inviteAllActionVisible({
    collectionSlug,
    docs: data?.docs,
    permissions: (user as { permissions?: unknown } | null | undefined)?.permissions,
  })
}
