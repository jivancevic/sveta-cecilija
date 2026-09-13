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
// **Mounted by `layout.tsx`, never by `AppShell`.** The shell is rendered by
// every page.tsx, so it remounts on every client navigation: the instance that
// hears `popstate` is unmounted before the screen it was going to restore has
// mounted, and a fresh instance starts with an empty ref and does nothing. That
// is exactly the bug this note exists to stop somebody re-introducing. The
// layout is the only thing in `/app` that survives a navigation.
//
// Nothing is restored on a FORWARD navigation: arriving at a screen you chose
// belongs at the top, and only `popstate` says "you have been here before".
//
// The decisions are in `lib/app/scroll-memory.ts` and tested there; this is the
// wiring: when to save, when to restore, and how long to wait for the new route
// to paint before touching its scroll.

/** How long after a Back a restore is still the right thing to do. */
const RESTORE_WINDOW_MS = 1500

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
  /**
   * When a Back is still worth restoring, as a DEADLINE rather than a flag.
   *
   * A flag would leak: a `popstate` that changes only the query string (the
   * filters on Narudžbe and Upiti live there) never re-runs the effect below,
   * so the flag would still be set at the next, unrelated navigation and would
   * scroll a screen the reader had chosen fresh. A deadline expires on its own.
   */
  const restoreUntil = useRef(0)
  /** The live `restore`, handed up by the effect that owns the listeners. */
  const restoreRef = useRef<(() => void) | null>(null)

  // Save continuously, so whatever ends the visit — a row tapped, a tab, the
  // back button — the last offset is already recorded. Throttled to one write
  // per frame: a scroll event fires far more often than that.
  useEffect(() => {
    const store = sessionStore()
    if (!store) return

    let saveFrame = 0
    const restoreFrames: [number, number] = [0, 0]

    function save() {
      cancelAnimationFrame(saveFrame)
      saveFrame = requestAnimationFrame(() => {
        rememberScroll(
          store,
          scrollKey(window.history.state, window.location.href),
          document.body.scrollTop,
        )
      })
    }

    /**
     * Put the current history entry back where it was.
     *
     * Two frames: the first is the paint React has just queued, the second is
     * the one in which the list is tall enough for the offset to mean anything.
     * Setting it before that clamps it to the height of a screen that is not
     * there yet. Applying it twice is harmless — it is the same number.
     */
    function restore() {
      const top = recallScroll(store, scrollKey(window.history.state, window.location.href))
      if (top === null) return
      cancelAnimationFrame(restoreFrames[0])
      cancelAnimationFrame(restoreFrames[1])
      restoreFrames[0] = requestAnimationFrame(() => {
        restoreFrames[1] = requestAnimationFrame(() => {
          document.body.scrollTop = top
        })
      })
    }

    function onPopState() {
      restoreUntil.current = Date.now() + RESTORE_WINDOW_MS
      // For a Back that does not change the path — a filter in the query
      // string — there is no render for the effect below to hang off, so the
      // attempt is made here as well.
      restore()
    }

    document.body.addEventListener('scroll', save, { passive: true })
    window.addEventListener('popstate', onPopState)
    // The effect below cannot reach `restore` from here, so it asks for it.
    restoreRef.current = restore

    return () => {
      document.body.removeEventListener('scroll', save)
      window.removeEventListener('popstate', onPopState)
      cancelAnimationFrame(saveFrame)
      cancelAnimationFrame(restoreFrames[0])
      cancelAnimationFrame(restoreFrames[1])
      restoreRef.current = null
    }
  }, [])

  // The screen this Back landed on has now rendered.
  useEffect(() => {
    if (Date.now() > restoreUntil.current) return
    restoreUntil.current = 0
    restoreRef.current?.()
  }, [pathname])

  return null
}
