'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import {
  recallScroll,
  rememberScroll,
  scrollKey,
  type ScrollStore,
} from '@/lib/app/scroll-memory'

// Back puts a list back where it was (#562 review, finding 2).
//
// The browser restores scroll on Back for the DOCUMENT, and since the redesign
// the document does not scroll: `.app` (the body) is the scroll container and
// its offset survives a client navigation untouched. Narudžbe → an order →
// Back therefore left the list at the order's offset. Five screens have long
// lists (Narudžbe, Izvedbe, Upiti, Članovi, Korisnici) and all five had it.
//
// Nothing is restored on a FORWARD navigation: arriving at a screen you chose
// belongs at the top, and only `popstate` says "you have been here before".
// That is the whole of the rule, and the reason this cannot simply write the
// offset on every render.
//
// The decisions are in `lib/app/scroll-memory.ts` and tested there; this is the
// wiring: when to save, when to restore, and how long to wait for the new route
// to paint before touching its scroll.

function sessionStore(): ScrollStore | null {
  try {
    return window.sessionStorage
  } catch {
    // Some browsers throw on the ACCESS, not on the call.
    return null
  }
}

export function ScrollMemory() {
  const pathname = usePathname()
  /** Set by popstate, read by the effect that runs once the new route renders. */
  const returning = useRef(false)

  // Save continuously, so whatever ends the visit — a row tapped, a tab, the
  // back button — the last offset is already recorded. Throttled to one write
  // per frame: a scroll event fires far more often than that.
  useEffect(() => {
    const store = sessionStore()
    if (!store) return

    let frame = 0
    function save() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        rememberScroll(
          store,
          scrollKey(window.history.state, window.location.href),
          document.body.scrollTop,
        )
      })
    }
    function onPopState() {
      returning.current = true
    }

    document.body.addEventListener('scroll', save, { passive: true })
    window.addEventListener('popstate', onPopState)
    return () => {
      document.body.removeEventListener('scroll', save)
      window.removeEventListener('popstate', onPopState)
      cancelAnimationFrame(frame)
    }
  }, [])

  // Restore after the route this Back landed on has rendered. Two frames: the
  // first is the paint React has just queued, the second is the one in which
  // the list is tall enough for the offset to mean anything. Setting it before
  // that clamps it to the height of a screen that is not there yet.
  useEffect(() => {
    if (!returning.current) return
    returning.current = false

    const store = sessionStore()
    if (!store) return
    const top = recallScroll(store, scrollKey(window.history.state, window.location.href))
    if (top === null) return

    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        document.body.scrollTop = top
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [pathname])

  return null
}
