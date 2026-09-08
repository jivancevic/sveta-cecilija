'use client'

import { useEffect, useRef } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// "Dodaj na početni zaslon" (#421, ADR-0024 story 32).
//
// One dismissible line, remembered per device in localStorage. No service
// worker in this phase, and no `beforeinstallprompt` handling: iOS never fires
// it and the hint has to work there most of all, so it is plain instructions
// rather than a button that only Android would light up.
//
// It renders in the server HTML and HIDES itself on mount when the device has
// already dismissed it or already installed the app. Hiding through the DOM
// (`el.hidden`) rather than through state keeps the effect free of a cascading
// re-render and keeps the server and client markup identical.
//
// Every storage access is wrapped: a private window, a browser that blocks site
// data, or a thumbnail-capture pass can each make localStorage throw, and none
// of that may take the page down.

const DISMISSED_KEY = 'moreskant.installHint.dismissed'

export function InstallHint() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let hide = false
    try {
      hide = window.localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      // No readable storage: show the hint, it is one line.
    }
    try {
      // Already installed: the standalone display mode means the icon exists.
      hide = hide || window.matchMedia?.('(display-mode: standalone)').matches === true
    } catch {
      // matchMedia unavailable; leave the hint visible.
    }
    el.hidden = hide
  }, [])

  return (
    <aside className="app__hint" ref={ref}>
      <strong>{APP_STRINGS.install.title}</strong>
      {APP_STRINGS.install.body}
      <button
        type="button"
        className="app__hint-close"
        aria-label={APP_STRINGS.install.dismiss}
        onClick={() => {
          if (ref.current) ref.current.hidden = true
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
