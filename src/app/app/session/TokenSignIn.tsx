'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// The one POST behind a sign-in link (#463).
//
// It fires on mount rather than on a tap: the dancer already tapped, in their
// messages, and asking them to confirm that they meant it is the form this
// ticket exists to remove. The POST (rather than doing the work in the page's
// GET) is what keeps a mail scanner from spending the link before its owner
// opens it — see the route for the full reason.
//
// `ran` guards React's development double-invoke of effects: two POSTs would
// both succeed and mint two sessions, which is harmless and still untidy.
export function TokenSignIn({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/app/session', {
          method: 'POST',
          // The `/app` request guard requires JSON: a cross-site HTML form can
          // only send the other three content types.
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (cancelled) return
        if (res.ok) {
          router.replace('/app')
          router.refresh()
          return
        }
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? APP_STRINGS.signIn.unexpected)
      } catch {
        if (!cancelled) setError(APP_STRINGS.signIn.unexpected)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, router])

  if (!error) {
    return (
      <p className="app__lead" role="status">
        {APP_STRINGS.signIn.working}
      </p>
    )
  }

  return (
    <>
      <p className="app__error" role="alert">
        {error}
      </p>
      <p className="app__aside">
        <Link className="app__link" href="/app/forgot">
          {APP_STRINGS.signIn.retry}
        </Link>
      </p>
      <p className="app__aside">
        <Link className="app__link" href="/app/login">
          {APP_STRINGS.signIn.toLogin}
        </Link>
      </p>
    </>
  )
}
