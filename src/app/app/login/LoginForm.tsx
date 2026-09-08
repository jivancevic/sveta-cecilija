'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// Posts to /api/app/login, which sets the shared Payload cookie and answers
// 200/401/400. The server owns every rule; this component owns the spinner and
// the message it is handed (#421).
export function LoginForm({ next = '/app' }: { next?: string }) {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      if (res.ok) {
        // `next` is already narrowed to a path inside /app by the server
        // (`safeAppNextPath`); this component never widens it.
        router.replace(next)
        router.refresh()
        return
      }
      const body = await res.json().catch(() => null)
      setError(body?.error ?? APP_STRINGS.login.unexpected)
    } catch {
      setError(APP_STRINGS.login.unexpected)
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
        <span>{APP_STRINGS.login.identifier}</span>
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
      <label className="app__field">
        <span>{APP_STRINGS.login.password}</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button className="app__button" type="submit" disabled={busy}>
        {busy ? APP_STRINGS.login.submitting : APP_STRINGS.login.submit}
      </button>
    </form>
  )
}
