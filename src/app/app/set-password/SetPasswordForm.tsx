'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'

// Posts to /api/app/set-password, which resets the password AND opens the
// session, so a 200 lands the dancer on /app already signed in rather than on a
// login form asking for the password they just chose (#424).
//
// The server owns every rule; this component owns the spinner and the sentence
// it is handed.
export function SetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, repeat }),
      })
      if (res.ok) {
        router.replace('/app')
        router.refresh()
        return
      }
      const body = await res.json().catch(() => null)
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
      <label className="app__field">
        <span>{APP_STRINGS.setPassword.password}</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="app__field">
        <span>{APP_STRINGS.setPassword.repeat}</span>
        <input
          type="password"
          name="repeat"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>
      <button className="app__button" type="submit" disabled={busy}>
        {busy ? APP_STRINGS.setPassword.submitting : APP_STRINGS.setPassword.submit}
      </button>
      <p className="app__aside">
        <Link className="app__link" href="/app/forgot">
          {APP_STRINGS.forgot.link}
        </Link>
      </p>
    </form>
  )
}
