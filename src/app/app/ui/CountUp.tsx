'use client'

import { useEffect, useRef, useState } from 'react'

// A number that arrives (#568).
//
// The one animation Ljestvica has beyond the podium's rise: the count on the
// reader's own row, and on the three steps, runs up from zero once when the
// screen first paints. It is the difference between a number that is printed
// and a number that lands.
//
// Three rules, and each of them is why this is a component rather than three
// lines in a screen:
//
//   - **The server renders the FINAL value.** The markup a reader gets with no
//     JavaScript, a slow phone, or a screen reader is the true count; the
//     animation is something the browser does to a number that is already
//     right, never the only way to learn it. That also means the row never
//     reflows: the width is the final width from the first paint.
//   - **`prefers-reduced-motion` gets no animation at all**, not a faster one.
//     The global rule in `ui.css` turns CSS animations off; a rAF loop is not
//     CSS, so it has to ask the same question itself.
//   - **Once per mount.** A re-render (the segment toggling, a refresh) must
//     not restart it, or the number on screen would tick back to zero every
//     time the reader touched something else.

export interface CountUpProps {
  value: number
  /** Milliseconds. Long enough to read as motion, short enough to be over. */
  duration?: number
  className?: string
}

export function CountUp({ value, duration = 800, className }: CountUpProps) {
  const [shown, setShown] = useState(value)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Zero has nowhere to count from, and a single evening counts itself.
    if (reduced || value <= 1) return

    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      // Ease out: the number slows into its final value rather than stopping.
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(value * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    // The first frame sets zero itself (t is 0 there), rather than a setState
    // in the body of the effect: a synchronous one cascades a second render
    // out of every mount for no gain, and the paint is a frame away either way.
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <span className={className}>{shown}</span>
}
