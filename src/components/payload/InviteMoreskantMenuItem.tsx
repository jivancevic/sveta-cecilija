'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { APP_STRINGS } from '@/lib/app/strings'
import { useInviteVisible } from './useInviteVisible'

/**
 * "Pošalji pozivnicu" on a Member (#424, ADR-0024).
 *
 * The one place a voditelj gives a dancer app access, without asking the
 * developer (#419, story 5). It POSTs the member id to `/api/app/invite` and
 * shows the answer inline, in Croatian, in the menu: a refusal names the field
 * to fix, a success says the mail went. It never navigates, least of all to
 * `/admin/login` — a stale tab would otherwise throw the voditelj out of the
 * form they were working in.
 *
 * Everything it can say comes from the route (`src/lib/app/invite.ts`); this
 * component chooses no message of its own.
 */
export function InviteMoreskantMenuItem() {
  const { id } = useDocumentInfo()
  const visible = useInviteVisible()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  if (!visible) return null

  const send = async () => {
    if (!id || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/app/invite', {
        method: 'POST',
        // The `/app` request guard requires JSON: a cross-site HTML form can
        // only send the other three content types.
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: String(id) }),
      })
      const body = await res.json().catch(() => null)
      setFailed(!res.ok)
      setMessage(
        (res.ok ? body?.message : body?.error) ?? APP_STRINGS.invite.unexpected,
      )
    } catch {
      setFailed(true)
      setMessage(APP_STRINGS.invite.unexpected)
    }
    setBusy(false)
  }

  return (
    <div style={{ padding: '4px 0', minWidth: 240 }}>
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
      {message && (
        <p
          role="status"
          style={{
            margin: '0 16px 8px',
            fontSize: 12,
            lineHeight: 1.4,
            color: failed ? 'var(--theme-error-500, #e53e3e)' : 'var(--theme-success-500, #218358)',
          }}
        >
          {message}
        </p>
      )}
    </div>
  )
}
