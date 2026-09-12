'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// Ends the shared Payload session through /api/app/logout, then sends the
// dancer to the app's own login page — never to /admin/login (#421). The JSON
// content type is required by the route's cross-site check (request-guard.ts),
// not by the empty body.
export function LogoutButton({ className = 'app__logout' }: { className?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await fetch('/api/app/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        } catch {
          // Offline: the cookie stays, and the next request simply still works.
        }
        router.push('/app/login')
        router.refresh()
      }}
    >
      {APP_STRINGS.header.logout}
    </button>
  )
}
