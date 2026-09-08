'use client'

import { useEffect, useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// "Dodaj na početni zaslon" (#421, ADR-0024 story 32).
//
// One dismissible line, remembered per device in localStorage. No service
// worker in this phase, and no `beforeinstallprompt` handling: iOS never fires
// it and the hint has to work there most of all, so it is plain instructions
// rather than a button that only Android would light up.
//
// Every storage access is wrapped: a private window, a browser that blocks site
// data, or an install-prompt screenshot pass can all make localStorage throw,
// and none of that may take the page down. It starts hidden and appears after
// mount, so the server HTML and the first client render agree.

const DISMISSED_KEY = 'moreskant.installHint.dismissed'

export function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === '1') return
    } catch {
      // No readable storage: show the hint, it is one line.
    }
    // Already installed: the standalone display mode means the icon exists.
    try {
      if (window.matchMedia?.('(display-mode: standalone)').matches) return
    } catch {
      // matchMedia unavailable; fall through and show it.
    }
    setShow(true)
  }, [])

  if (!show) return null

  return (
    <aside className="app__hint">
      <strong>{APP_STRINGS.install.title}</strong>
      {APP_STRINGS.install.body}
      <button
        type="button"
        className="app__hint-close"
        aria-label={APP_STRINGS.install.dismiss}
        onClick={() => {
          setShow(false)
          try {
            window.localStorage.setItem(DISMISSED_KEY, '1')
          } catch {
            // Not remembered this time; the hint simply comes back.
          }
        }}
      >
        ×
      </button>
    </aside>
  )
}
