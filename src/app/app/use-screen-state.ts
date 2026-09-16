'use client'

import { useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { nextSearch, type ScreenPatch } from '@/lib/app/screen-state'

// Writing a screen's state into its address WITHOUT asking the server again
// (#666, ADR-0030).
//
// The screens the browser filters — Članovi, an open "Prošle izvedbe" — already
// hold every row in the page. Their filtering must happen on the keystroke, in a
// hall, on a bar of 3G, so a `router.replace` per letter is exactly the wrong
// tool: every screen in `/app` is `force-dynamic`, so each one would be a round
// trip to the database to re-render rows that never changed.
//
// `history.replaceState` writes the same address with no navigation at all. The
// state survives because it IS the history entry: come back to it and the
// address arrives with the filter in it, and the screen reads its own opening
// state from there.
//
// **`window.history.state` is passed through unchanged**, deliberately: Next
// keeps its per-entry `key` on it and `ScrollMemory` looks that key up to find
// where the list was. Replacing the state object with `null` — the tempting
// shorthand — silently breaks the scroll half of this very ticket.
//
// It replaces and never pushes, which is the decision from the grilling: Back
// must take the reader off the screen, not undo their last filter one chip at a
// time.
//
// The arithmetic is `lib/app/screen-state.ts` and tested there.

/** Mirror a change into the address, leaving the history stack alone. */
export function useMirrorState(): (patch: ScreenPatch) => void {
  const pathname = usePathname()

  return useCallback(
    (patch: ScreenPatch) => {
      try {
        const search = nextSearch(window.location.search, patch)
        window.history.replaceState(window.history.state, '', `${pathname}${search}`)
      } catch {
        // A browser that refuses to rewrite its own address costs the reader a
        // remembered filter, never a working screen.
      }
    },
    [pathname],
  )
}
