'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// Clears the shared Payload cookie through /api/app/logout, then sends the
// dancer to the app's own login page — never to /admin/login (#421).
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
          await fetch('/api/app/logout', { method: 'POST' })
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
