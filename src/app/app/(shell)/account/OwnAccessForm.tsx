'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Note } from '../../ui'

// "E-mail i lozinka" on Profil (#651, ADR-0028), the successor to
// `SetPasswordForm`.
//
// **One form, because it is one task.** An address with no password cannot sign
// anybody in and a password with no address cannot be recovered, so a dancer
// who fills this in once holds both halves of their own way in. The route still
// accepts either alone, which is what lets somebody who already has an address
// change only the password without retyping it.
//
// It does not navigate afterwards: the reader was signed in when they opened
// this, so there is nowhere to arrive. A sentence where the form was is the
// whole confirmation, the password boxes are cleared so the page is not left
// holding what it just sent, and `router.refresh()` is what takes the Početna
// card away without a reload (#593's cache note applies here too).
//
// The address in the field is the reader's OWN, and this is the only screen in
// Cecilija that shows one. The server owns every rule; this component owns the
// spinner and the sentence it is handed.

const S = APP_STRINGS.ownAccess

export function OwnAccessForm({ email: stored }: { email: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState(stored ?? '')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, repeat }),
      })
      if (res.ok) {
        setPassword('')
        setRepeat('')
        setDone(true)
        setBusy(false)
        router.refresh()
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? S.unexpected)
    } catch {
      setError(S.unexpected)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && <Note role="alert">{error}</Note>}
      {done && !error && <Note role="status">{S.saved}</Note>}
      <label className="app__field">
        <span>{S.email}</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setDone(false)
          }}
          disabled={busy}
        />
        <small>{S.emailHint}</small>
      </label>
      <label className="app__field">
        <span>{S.password}</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setDone(false)
          }}
          disabled={busy}
        />
      </label>
      <label className="app__field">
        <span>{S.repeat}</span>
        <input
          type="password"
          name="repeat"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value)
            setDone(false)
          }}
          disabled={busy}
        />
      </label>
      <Button variant="primary" type="submit" disabled={busy}>
        {busy ? S.submitting : S.submit}
      </Button>
    </form>
  )
}
