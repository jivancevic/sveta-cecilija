'use client'

import { useState } from 'react'
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
  open,
  summary,
  className,
  children,
}: {
  /** The key in the address. `past` on both screens that have one. */
  param: string
  /** Open on arrival, decided by the server from the address it was given. */
  open: boolean
  /** The `<summary>` line, which is the control. */
  summary: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  // Seeded from the server's answer, then owned here: an uncontrolled `<details>`
  // would let the DOM and the address drift apart on the reader's second tap.
  const [isOpen, setIsOpen] = useState(open)
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
