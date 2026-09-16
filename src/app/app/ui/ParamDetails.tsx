'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { flagValue } from '@/lib/app/screen-state'
import { useMirrorState } from '../use-screen-state'

// A `<details>` whose open state is part of the address (#666, ADR-0030).
//
// "Prošle izvedbe" on Moreška and on Izvedbe was a plain `<details>`, and a
// plain `<details>` keeps its open state in the DOM. `ScreenTransition` rebuilds
// the page on every navigation (`<div key={pathname}>`, for the slide), so the
// harmonica closed itself every time the reader opened one nastup and came back.
// Josip's own example: he opens the past, taps an evening, comes back, and the
// past has folded up under him — which is also why the remembered scroll offset
// then had nowhere to go, the page being a screen and a half shorter than the
// one he left.
//
// The element stays a real `<details>`: the browser's own disclosure, keyboard
// behaviour and find-in-page all keep working, and the server renders it already
// open when the address says so, so there is no flash of a folded list.
//
// It MIRRORS rather than navigates (`useMirrorState`): nothing on the server
// depends on this flag, and a round trip to open a harmonica would be a wait
// where there is currently none.

export function ParamDetails({
  param,
  summary,
  className,
  children,
}: {
  /** The key in the address. `past` on both screens that have one. */
  param: string
  /** The `<summary>` line, which is the control. */
  summary: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  // Seeded from the ADDRESS, and this is the one decision in the file worth
  // arguing about. The server could parse it and hand it down as a prop, and
  // that is what this component did first — but on a Back the Next router
  // rebuilds the page from the tree stored on the history entry, which is the
  // one from BEFORE the address was mirrored, so the server's answer is the
  // stale one and the harmonica would fold on exactly the journey this ticket
  // exists to fix. `useSearchParams` reads the router's canonical URL, which
  // `popstate` updates from `window.location`, so it is right in both cases —
  // and because every `/app` screen is `force-dynamic` it is right during the
  // server render too, so a shared link still arrives open with no flash.
  const params = useSearchParams()
  const [isOpen, setIsOpen] = useState(() => params?.get(param) === '1')
  const mirror = useMirrorState()

  return (
    <details
      className={className}
      open={isOpen}
      onToggle={(event) => {
        const next = event.currentTarget.open
        setIsOpen(next)
        mirror({ [param]: flagValue(next) })
      }}
    >
      <summary>{summary}</summary>
      {children}
    </details>
  )
}
