'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// The two buttons of the consent screen (#438, story 57).
//
// They POST JSON to `/api/app/authorize` rather than submitting a form,
// because the `/app` request guard requires `application/json` — which is
// exactly what stops a cross-site HTML form from issuing an authorization code
// with the visitor's session cookie. The server owns every rule and answers
// with the URL to go to; this component owns the spinner and the message.
//
// The navigation is `window.location.assign`, not `router.push`: the
// destination is the OAuth client's callback on another origin, which the
// Next.js router does not handle.

export interface ConsentParams {
  client_id: string
  redirect_uri: string
  state: string
  code_challenge: string
  code_challenge_method: string
  resource: string
  scope: string
}

export function ConsentButtons({ params }: { params: ConsentParams }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function decide(decision: 'allow' | 'deny') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, decision }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && typeof body?.redirect === 'string') {
        window.location.assign(body.redirect)
        return
      }
      setError(body?.error ?? APP_STRINGS.authorize.failed)
    } catch {
      setError(APP_STRINGS.authorize.failed)
    }
    setBusy(false)
  }

  return (
    <>
      {error && (
        <p className="app__error" role="alert">
          {error}
        </p>
      )}
      <button className="app__button" type="button" disabled={busy} onClick={() => decide('allow')}>
        {busy ? APP_STRINGS.authorize.working : APP_STRINGS.authorize.allow}
      </button>
      <p className="app__aside">
        <button
          className="app__link"
          type="button"
          disabled={busy}
          onClick={() => decide('deny')}
        >
          {APP_STRINGS.authorize.deny}
        </button>
      </p>
    </>
  )
}
