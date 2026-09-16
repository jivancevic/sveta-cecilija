'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { nextDepth, readDepth, writeDepth, type NavStore } from '@/lib/app/nav-memory'

// How deep into Cecilija this reader has walked (#666).
//
// Renders nothing. It keeps one number — how many of our own screens are behind
// the current one — so `BackButton` can tell the reader who tapped their way
// here from the reader a push notification dropped straight onto one nastup.
// The first gets a real `history.back()`, which is what makes the address, the
// filters and the scroll offset come back with them. The second gets a link,
// because Back there leaves the app.
//
// **In the ROOT layout, beside `ScrollMemory`, and for the same reason**: the
// shell is rendered by every page.tsx and remounts on every navigation, so a ref
// set before a `popstate` belongs to an instance that is already gone. The
// layout is the one thing in `/app` that survives one.
//
// The count lives in `sessionStorage`, which is exactly the right lifetime and
// not a compromise: a new tab starts at zero (nothing of ours behind), a reload
// keeps the true count (the entries are still there), and a relaunched installed
// app starts fresh (its history did too). Nothing needs resetting anywhere.
//
// The rules are `lib/app/nav-memory.ts` and tested there; this is the wiring:
// what counts as a step, and which way.

/**
 * How long after a `popstate` the next render still belongs to it.
 *
 * The same deadline idiom `ScrollMemory` uses, for the same reason: a `popstate`
 * that changes nothing the router can see — a hash, a restored tab — produces no
 * render at all, and a plain flag would still be set at the next, unrelated
 * navigation and would read a push as a pop. Undercounting is the one direction
 * that hurts: it turns a working Back into a link.
 */
const POP_WINDOW_MS = 500

function sessionStore(): NavStore | null {
  try {
    return window.sessionStorage
  } catch {
    // Some browsers throw on the ACCESS, not on the call.
    return null
  }
}

export function NavMemory() {
  const pathname = usePathname()
  const search = useSearchParams()
  // A pager and a filter live in the query string, so the path alone would miss
  // half the steps this counts.
  const entry = `${pathname}?${search?.toString() ?? ''}`

  const poppedUntil = useRef(0)
  const first = useRef(true)

  useEffect(() => {
    const store = sessionStore()

    // Counted HERE rather than in the render effect below, because a `popstate`
    // does not always produce one.
    function onPopState() {
      poppedUntil.current = Date.now() + POP_WINDOW_MS
      writeDepth(store, nextDepth(readDepth(store), 'pop'))
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    // The screen the document opened on is not a step: it is the floor.
    if (first.current) {
      first.current = false
      return
    }
    // A pop has already been counted by the listener.
    if (Date.now() <= poppedUntil.current) {
      poppedUntil.current = 0
      return
    }
    const store = sessionStore()
    writeDepth(store, nextDepth(readDepth(store), 'push'))
  }, [entry])

  return null
}
