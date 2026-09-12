'use client'

import React, { useState } from 'react'
import { toast } from '@payloadcms/ui'
import { APP_STRINGS } from '@/lib/app/strings'
import { useInviteAllVisible } from './useInviteAllVisible'

/**
 * "Pošalji pozivnice svima" on the Members LIST (#462, ADR-0024).
 *
 * The bulk half of #424's per-Member action: a voditelj should be able to close
 * the gap between the roster and the logins without first reading the "Ima
 * prijavu" column down forty rows and opening each miss by hand.
 *
 * The answer goes to a **toast**, for the reason written on
 * `InviteMoreskantMenuItem`: Payload closes the menu popup on click, so
 * anything rendered inside it is unmounted before the fetch resolves. And every
 * word it can say comes from the route (`src/lib/app/invite-all.ts`); this
 * component chooses no message of its own.
 *
 * It does not refresh the list afterwards. "Ima prijavu" is a virtual field
 * filled per request, so the column is already right on the next load, and a
 * forced reload under a voditelj who is reading the toast would take the
 * sentence away with it.
 */
export function InviteAllMoreskantiMenuItem() {
  const visible = useInviteAllVisible()
  const [busy, setBusy] = useState(false)

  if (!visible) return null

  const send = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/app/invite/all', {
        method: 'POST',
        // The `/app` request guard requires JSON: a cross-site HTML form can
        // only send the other three content types.
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) toast.success(body?.message ?? APP_STRINGS.inviteAll.none)
      else toast.error(body?.error ?? APP_STRINGS.inviteAll.unexpected)
    } catch {
      toast.error(APP_STRINGS.inviteAll.unexpected)
    }
    setBusy(false)
  }

  return (
    <button
      onClick={send}
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
      {busy ? APP_STRINGS.inviteAll.sending : APP_STRINGS.inviteAll.action}
    </button>
  )
}
