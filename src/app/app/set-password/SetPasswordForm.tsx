'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// Posts to /api/app/set-password, which writes the hash on the caller's own row
// and nothing else (#424, rewritten #463).
//
// It does not navigate afterwards: the dancer was already signed in when they
// opened this, so there is nowhere to arrive. A sentence where the form was is
// the whole confirmation, and the fields are cleared so the page is not left
// holding the password it just sent.
//
// The server owns every rule; this component owns the spinner and the sentence
// it is handed.
export function SetPasswordForm() {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, repeat }),
      })
      if (res.ok) {
        setPassword('')
        setRepeat('')
        setDone(true)
        setBusy(false)
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? APP_STRINGS.setPassword.unexpected)
    } catch {
      setError(APP_STRINGS.setPassword.unexpected)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <p className="app__error" role="alert">
          {error}
        </p>
      )}
      {done && !error && (
        <p className="app__answer-note" role="status">
          {APP_STRINGS.setPassword.saved}
        </p>
      )}
      <label className="app__field">
        <span>{APP_STRINGS.setPassword.password}</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setDone(false)
          }}
        />
      </label>
      <label className="app__field">
        <span>{APP_STRINGS.setPassword.repeat}</span>
        <input
          type="password"
          name="repeat"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value)
            setDone(false)
          }}
        />
      </label>
      <button className="app__button" type="submit" disabled={busy}>
        {busy ? APP_STRINGS.setPassword.submitting : APP_STRINGS.setPassword.submit}
      </button>
    </form>
  )
}
