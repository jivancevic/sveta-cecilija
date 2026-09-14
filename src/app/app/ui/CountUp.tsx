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
//   - **Once per mount, unless the caller says otherwise.** A re-render (the
//     segment toggling, a refresh) must not restart it, or the number on
//     screen would tick back to zero every time the reader touched something
//     else. `live` is the exception and Skener is why (#572): the door's "ušlo"
//     goes up while the screen is open, and a number that changed without
//     moving is a number nobody notices changing. A live run counts from what
//     is ON SCREEN to the new value, never from zero — restarting at zero every
//     admission would read as a reset rather than as one more person in.

export interface CountUpProps {
  value: number
  /** Milliseconds. Long enough to read as motion, short enough to be over. */
  duration?: number
  /** Run again whenever the value changes, from the number already shown. */
  live?: boolean
  className?: string
}

export function CountUp({ value, duration = 800, live = false, className }: CountUpProps) {
  const [shown, setShown] = useState(value)
  const ran = useRef(false)
  /** What the next run counts from: zero on the first paint, the number on
   *  screen after that. */
  const from = useRef(0)

  useEffect(() => {
    if (ran.current && !live) return
    const start = ran.current ? from.current : 0
    ran.current = true

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // **A hidden tab gets no frames at all**, so a live counter that only ever
    // arrived through `requestAnimationFrame` would sit on a stale number until
    // something else re-rendered it. That is not a corner case at the door: the
    // phone locks between rushes and comes back with people already admitted.
    // Found in a real browser (#572), where the count refused to move in a
    // backgrounded tab while the ring beside it had already turned.
    const unseen = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    // Zero has nowhere to count from, and a single evening counts itself. The
    // value is still written out: a run that skips the animation must never
    // also skip the number.
    if (reduced || unseen || value <= 1 || start === value) {
      from.current = value
      setShown(value)
      return
    }

    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      // Ease out: the number slows into its final value rather than stopping.
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(start + (value - start) * eased)
      from.current = next
      setShown(next)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    // The first frame sets the start itself (t is 0 there), rather than a
    // setState in the body of the effect: a synchronous one cascades a second
    // render out of every mount for no gain, and the paint is a frame away
    // either way.
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      // **The ref is released here, and that is what makes dev honest.**
      // StrictMode runs every effect twice: the first run queues a frame, the
      // cleanup cancels it, and a `ran` that stayed true made the second run
      // exit before queuing anything — so the animation never ran at all in
      // development while working in production. Releasing it lets the second
      // run start over, which is the behaviour the double-invoke is for. A
      // live counter keeps the flag: its effect re-runs on the value anyway,
      // and releasing it would send the next admission back to zero.
      ran.current = live
    }
  }, [value, duration, live])

  return (
    // The box is as wide as the FINAL number from the first paint, so counting
    // up from zero moves nothing around it. `ch` is the width of a "0" in the
    // current face, and the digits sit to the right of the box because that is
    // the edge a column of counts is read against. Deliberately NOT
    // `tabular-nums`: Labrada's tabular figures are a third wider than its
    // proportional ones and put a visible hole in the middle of "18".
    <span
      className={className}
      style={{
        display: 'inline-block',
        minWidth: `${String(value).length}ch`,
        textAlign: 'right',
      }}
    >
      {shown}
    </span>
  )
}
