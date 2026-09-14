'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  activeTabKey,
  slideDirection,
  type AppNav as Nav,
  type SlideDirection,
} from '@/lib/app/screens'

// The 200 ms that tells you which way you went (#593).
//
// Now that the chrome lives in the layout, only the content changes on a tab
// tap — and a content block that simply swaps reads as a jump cut. This is the
// missing half of the bar's own thumb: the thumb slides to the tab you pressed
// and the screen slides in from the side that tab sits on, so one movement says
// "right" twice instead of the app blinking at you.
//
// Deliberately small: one `key` on a wrapper, two CSS keyframes, no library, no
// View Transitions and no experimental flag (#593, Q15). Keying on the pathname
// is what makes React mount the new screen as a NEW element, which is the only
// reason an entry animation can run at all.
//
// The direction rule is `slideDirection` in `lib/app/screens.ts`, pure and
// tested without a router: the browser supplies a pathname and nothing else.
// A path that is not in the bar (an order, a dancer, one nastup) arrives from
// the right, which is the step-forward-out-of-a-list every phone draws.
//
// **Only the pathname triggers it**, so the filters on Narudžbe and Upiti —
// which live in the query string — change their list in place rather than
// sliding the screen sideways every time a chip is tapped.
//
// The `transform` in the keyframes makes this wrapper the containing block of
// any `position: fixed` descendant WHILE IT RUNS. It ends on `transform: none`,
// which creates no containing block, so the scanner overlay and the sheets are
// unaffected the moment the 200 ms is over — and nothing can be opened inside
// it before then, because the screen carrying the button is still arriving.
//
// Under `prefers-reduced-motion: reduce` the animation is dropped in CSS and
// the screen simply appears, which is the whole of the accommodation.

export function ScreenTransition({ nav, children }: { nav: Nav; children: React.ReactNode }) {
  const pathname = usePathname() ?? '/app'
  const index = tabIndex(nav, pathname)

  // The direction is decided ONCE per pathname and then held: a re-render of
  // the layout (a `router.refresh()` after a write, a state change above) must
  // not be able to recompute it, or a screen already sitting still would be
  // told it arrived from the other side.
  //
  // This is React's own "adjust state while rendering" pattern rather than a
  // ref: setting state during render of the SAME component is supported and
  // re-runs this render before anything is committed, so no extra frame and no
  // effect is involved. A ref would be simpler to read and is not allowed to be
  // touched during render.
  const [seen, setSeen] = useState<{
    pathname: string
    index: number
    direction: SlideDirection
  }>({ pathname, index, direction: 'right' })

  const moved = seen.pathname !== pathname
  const direction = moved ? slideDirection(seen.index, index) : seen.direction
  if (moved) setSeen({ pathname, index, direction })

  return (
    <div key={pathname} className="app__screen" data-slide={direction}>
      {children}
    </div>
  )
}

/** Where this path sits in the bar, or -1 for a screen the bar does not carry. */
function tabIndex(nav: Nav, pathname: string): number {
  const key = activeTabKey(nav, pathname)
  return key === null ? -1 : nav.tabs.findIndex((tab) => tab.key === key)
}
