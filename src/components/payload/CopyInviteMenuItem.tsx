'use client'

import React, { useState } from 'react'
import { toast, useDocumentInfo } from '@payloadcms/ui'
import { APP_STRINGS } from '@/lib/app/strings'
import { useInviteVisible } from './useInviteVisible'

/**
 * "Kopiraj pozivnicu" on a Member (#463).
 *
 * The sibling of "Pošalji pozivnicu", for the dancer that button refuses: the
 * one with no e-mail address, which on the production roster is seventy-five
 * moreškanti out of seventy-six. It POSTs to `/api/app/invite/link`, which
 * opens the login exactly as the mail route does, and puts the ready Croatian
 * message on the clipboard for the voditelj to send **by SMS**.
 *
 * Only the clipboard, not the deep links: `sms:` opens a composer on a phone
 * and does nothing on the desktop where `/admin` is usually read. The phone
 * half of this lives in `/app/invitations`, which is a voditelj's own screen with
 * the SMS and WhatsApp buttons on it.
 *
 * The answer goes to a toast for the same reason the invitation's does: Payload
 * unmounts the edit-menu popup on click, so a message rendered in here is gone
 * before the fetch resolves.
 */
export function CopyInviteMenuItem() {
  const { id } = useDocumentInfo()
  const visible = useInviteVisible()
  const [busy, setBusy] = useState(false)

  if (!visible) return null

  const copy = async () => {
    if (!id || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/app/invite/link', {
        method: 'POST',
        // The `/app` request guard requires JSON: a cross-site HTML form can
        // only send the other three content types.
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: String(id) }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(body?.error ?? APP_STRINGS.inviteLink.failed)
        setBusy(false)
        return
      }
      try {
        await navigator.clipboard.writeText(String(body?.message ?? ''))
        toast.success(APP_STRINGS.inviteLink.copied(String(body?.name ?? '')))
      } catch {
        // Clipboard access is refused more often than one expects (an insecure
        // origin, a permission prompt nobody answered). The invitation exists
        // either way, so hand the link over rather than losing it.
        toast.error(`${APP_STRINGS.inviteLink.copyFailed} ${String(body?.link ?? '')}`)
      }
    } catch {
      toast.error(APP_STRINGS.inviteLink.failed)
    }
    setBusy(false)
  }

  return (
    <button
      onClick={copy}
      disabled={busy}
      style={{
        display: 'block',
        width: '100%',
        padding: '8px 16px',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: busy ? 'wait' : 'pointer',
        fontSize: 14,
        color: 'inherit',
      }}
    >
      {busy ? APP_STRINGS.inviteLink.working : APP_STRINGS.inviteLink.action}
    </button>
  )
}
