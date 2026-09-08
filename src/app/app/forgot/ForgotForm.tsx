'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// Posts to /api/app/forgot, which always answers 200 with the same sentence
// whether or not the account exists (#424). The form therefore has nothing to
// branch on either: it shows what it is handed and hides the field, so nobody
// is invited to try a second address and read the difference.
export function ForgotForm() {
  const [identifier, setIdentifier] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok) setNotice(body?.message ?? APP_STRINGS.forgot.sent)
      else setError(body?.error ?? APP_STRINGS.forgot.unexpected)
    } catch {
      setError(APP_STRINGS.forgot.unexpected)
    }
    setBusy(false)
  }

  if (notice) {
    return (
      <p className="app__notice" role="status">
        {notice}
      </p>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <p className="app__error" role="alert">
          {error}
        </p>
      )}
      <label className="app__field">
        <span>{APP_STRINGS.forgot.identifier}</span>
        <input
          type="text"
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
      </label>
      <button className="app__button" type="submit" disabled={busy}>
        {busy ? APP_STRINGS.forgot.submitting : APP_STRINGS.forgot.submit}
      </button>
    </form>
  )
}
