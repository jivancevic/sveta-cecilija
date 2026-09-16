'use client'

import { useEffect } from 'react'
import { keyboardInset, keyboardIsOpen } from '@/lib/app/keyboard-inset'

// Tells the app how tall the on-screen keyboard is (#667).
//
// Renders nothing. It writes one CSS variable, `--kb`, and one attribute,
// `data-keyboard`, and every bottom-anchored surface in the app reads them: the
// sheets, the toast, and the tab bar, which gets out of the way. The scrim
// deliberately does NOT: it is `inset: 0` and should keep covering the whole
// layout viewport, including the strip the keyboard is standing on, so a tap
// anywhere outside the panel still closes it.
//
// Before this, nothing in `/app` listened to `window.visualViewport` at all —
// the one reference in the repo was the dev strip's diagnostic readout. So a
// sheet with a search in it sat at `bottom: 0` of the layout viewport, which
// neither iOS nor Chrome shrinks for a keyboard, and the reader typed into a
// panel they could no longer see.
//
// **In the ROOT layout**, with `ScrollMemory` and `NavMemory`: a sheet is
// portalled to `document.body` and a toast is drawn by the shell, so the
// variable has to be somewhere both inherit from, and the component that
// maintains it must survive a navigation.
//
// `scroll` as well as `resize`: on iOS the keyboard often does not resize the
// visual viewport at all, it scrolls it, and the whole gap then arrives in
// `offsetTop`. The listener is passive and the work is one write of one
// variable — no layout is read here, so this cannot thrash.
//
// The arithmetic, including the threshold that keeps a collapsing address bar
// from reading as a keyboard, is `lib/app/keyboard-inset.ts` and tested there.

export function KeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    // The value last written, so a scroll event that changes nothing — and
    // there are a great many of those — does not touch the DOM at all.
    let written = -1

    function apply() {
      const inset = keyboardInset({
        innerHeight: window.innerHeight,
        viewportHeight: viewport?.height ?? 0,
        offsetTop: viewport?.offsetTop ?? 0,
      })
      if (inset === written) return
      written = inset

      const root = document.documentElement
      root.style.setProperty('--kb', `${inset}px`)
      if (keyboardIsOpen(inset)) document.body.dataset.keyboard = 'open'
      else delete document.body.dataset.keyboard
    }

    apply()
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)

    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
      // Leave nothing behind: an unmount with `--kb` still set would be a
      // permanent gap at the bottom of every screen.
      document.documentElement.style.removeProperty('--kb')
      delete document.body.dataset.keyboard
    }
  }, [])

  return null
}
