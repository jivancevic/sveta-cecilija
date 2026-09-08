'use client'

import React, { useState } from 'react'
import { toast, useDocumentInfo } from '@payloadcms/ui'
import { APP_STRINGS } from '@/lib/app/strings'
import { useInviteVisible } from './useInviteVisible'

/**
 * "Pošalji pozivnicu" on a Member (#424, ADR-0024).
 *
 * The one place a voditelj gives a dancer app access, without asking the
 * developer (#419, story 5). It POSTs the member id to `/api/app/invite` and
 * says what happened in Croatian: a refusal names the field to fix, a success
 * says the mail went. It never navigates, least of all to `/admin/login` — a
 * stale tab would otherwise throw the voditelj out of the form they were in.
 *
 * The answer goes to a **toast**, not to a line inside this menu: Payload
 * closes the edit-menu popup on click, so anything rendered here is unmounted
 * before the fetch resolves and the voditelj would watch a menu shut and hear
 * nothing (verified in the browser, #424).
 *
 * Every word it can say comes from the route (`src/lib/app/invite.ts`); this
 * component chooses no message of its own.
 */
export function InviteMoreskantMenuItem() {
  const { id } = useDocumentInfo()
  const visible = useInviteVisible()
  const [busy, setBusy] = useState(false)

  if (!visible) return null

  const send = async () => {
    if (!id || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/app/invite', {
        method: 'POST',
        // The `/app` request guard requires JSON: a cross-site HTML form can
        // only send the other three content types.
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: String(id) }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) toast.success(body?.message ?? APP_STRINGS.invite.sentAgain)
      else toast.error(body?.error ?? APP_STRINGS.invite.unexpected)
    } catch {
      toast.error(APP_STRINGS.invite.unexpected)
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
      {busy ? APP_STRINGS.invite.sending : APP_STRINGS.invite.action}
    </button>
  )
}
