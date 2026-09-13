'use client'

import { useEffect, useState } from 'react'

// A banner with a bar that drains, and dismisses itself when the bar is empty
// (#505, ported from the two banners of the Backoffice partner dashboard).
//
// Two things use it and they are opposites, which is why the timing is a
// parameter rather than a constant: the sale confirmation (10s, nothing to
// decide) and the cancel's undo offer (6s for an order, 4s for one ticket,
// ADR-0017 — the void is already committed, the bar is how long the way back
// stays open).
//
// The bar drives the dismissal rather than a parallel timer, so the words and
// the bar can never disagree. A backgrounded tab never fires `transitionend`,
// so a fallback timer slightly longer than the bar closes it anyway.
export function DrainBanner({
  ms,
  onDone,
  tone = 'quiet',
  children,
}: {
  ms: number
  onDone: () => void
  /** `good` is the sale confirmation; `quiet` is the undo offer. */
  tone?: 'good' | 'quiet'
  children: React.ReactNode
}) {
  const [width, setWidth] = useState(100)

  useEffect(() => {
    // Start draining a frame after mount, so the transition actually runs.
    const raf = requestAnimationFrame(() => setWidth(0))
    const fallback = setTimeout(onDone, ms + 600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
  }, [ms, onDone])

  return (
    <div className={`app__drain app__drain--${tone}`} role="status">
      {children}
      <div className="app__drain-track">
        <i
          className="app__drain-fill"
          style={{ width: `${width}%`, transition: `width ${ms}ms linear` }}
          onTransitionEnd={(e) => {
            if (e.propertyName === 'width') onDone()
          }}
        />
      </div>
    </div>
  )
}
