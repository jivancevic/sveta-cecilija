'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'

// Pull down to refresh (#562).
//
// Every `/app` page is `force-dynamic`, so the numbers on it are only as fresh
// as the last render. On a phone at the door or in the wings, the gesture a
// thumb already knows is the cheapest way to ask again — and `router.refresh()`
// re-runs the server render in place, so no state is lost and nothing flashes.
//
// The rules the gesture obeys, all of them from the prototype:
//
//   - it arms ONLY at the very top of the scroll and only downwards, so it can
//     never steal a scroll from a list;
//   - it is elastic: 110px of travel however hard you pull, armed at 72;
//   - a gold ring fills with the pull, spins for the length of the request and
//     the block settles back on a spring;
//   - it confirms with one toast, "Osvježeno · 21:05", and says nothing else.
//
// Under `prefers-reduced-motion` the component listens for nothing at all: a
// person who has asked for less motion gets none of it rather than some.
//
// The gesture is driven straight against the DOM rather than through React
// state: it runs at touch frequency, and re-rendering a whole screen sixty
// times a second to move it eight pixels is how a phone starts dropping frames.
//
// `will-change` is added for the length of the gesture ONLY. Left standing it
// would make this wrapper the containing block of every `position: fixed`
// descendant — the scanner overlay, a sheet — for the whole life of the screen.

/** The furthest the block travels, however hard the pull. */
const MAX = 110
/** Past this, letting go refreshes. */
const ARM = 72
/** How long the ring spins before the refreshed screen is shown. */
const SPIN_MS = 900
/** The ring's circumference, so the arc can be filled by dash offset. */
const RING = 56.5
const TOAST_MS = 1600

function clockLabel(now: Date): string {
  const hh = now.getHours()
  const mm = `0${now.getMinutes()}`.slice(-2)
  return `${hh}:${mm}`
}

/**
 * Anything that covers the screen is NOT the screen, and must not be pulled.
 *
 * A `position: fixed; inset: 0` overlay rendered inside the wrapper — the
 * Skener camera, a Sheet — resolves its inset against that wrapper the moment
 * the wrapper is transformed, so a finger dragged down over the camera would
 * take the viewfinder with it and then refresh the page behind it. The gesture
 * simply never starts there.
 *
 * `data-no-pull` is the general way to say so and the one a new overlay should
 * use; the class and the role are belt and braces for the two that exist.
 * `document.body.style.overflow` covers a modal that has locked the scroll:
 * nothing is scrollable then, so nothing is pullable either.
 */
function isShielded(target: EventTarget | null): boolean {
  if (document.body.style.overflow === 'hidden') return true
  if (!(target instanceof Element)) return false
  return target.closest('[data-no-pull], .app__scan-overlay, [role="dialog"]') !== null
}

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pull = useRef<HTMLDivElement | null>(null)
  const ptr = useRef<HTMLDivElement | null>(null)
  const arc = useRef<SVGCircleElement | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // `.app` is the scroll container (the document itself never scrolls), so
    // the top of the scroll is ITS scrollTop and not the document's.
    const scroller = document.body
    const block = pull.current
    const ring = ptr.current
    const circle = arc.current
    if (!block || !ring || !circle) return

    let origin: number | null = null
    let delta = 0
    let busy = false

    function rest() {
      if (!block || !ring || !circle) return
      block.style.transform = ''
      ring.style.opacity = '0'
      ring.style.transform = 'translateY(-48px) scale(.6)'
      ring.classList.remove('app__ptr--armed')
    }

    function start(y: number, target: EventTarget | null) {
      if (busy || scroller.scrollTop > 0) return
      if (isShielded(target)) return
      origin = y
      delta = 0
      block?.classList.remove('app__pull--settle')
      ring?.classList.remove('app__ptr--settle')
      block?.classList.add('app__pull--pulling')
    }

    function move(y: number, event: TouchEvent) {
      if (origin === null || busy || !block || !ring || !circle) return
      delta = y - origin
      // Upwards, or the list has scrolled under the finger: this is a scroll,
      // not a pull, and the gesture hands it back rather than fighting it.
      if (delta <= 0 || scroller.scrollTop > 0) {
        if (delta <= 0) {
          origin = y
        } else {
          // The list moved under the finger: this is a scroll. Hand it back,
          // put anything already moved back where it was, and drop
          // `will-change` with it — `end()` has nothing to do after this, so
          // this is the only place that can.
          origin = null
          rest()
          block.classList.remove('app__pull--pulling')
        }
        return
      }
      if (event.cancelable) event.preventDefault()

      const travel = MAX * (1 - Math.exp(-delta / 160))
      const share = Math.min(delta / ARM, 1)
      block.style.transform = `translateY(${travel}px)`
      ring.style.opacity = String(Math.min(share * 1.4, 1))
      ring.style.transform = `translateY(${travel - 48}px) scale(${0.6 + 0.4 * share})`
      circle.style.strokeDashoffset = String(RING * (1 - share))
      ring.classList.toggle('app__ptr--armed', share >= 1)
    }

    function end() {
      if (!block || !ring) return
      // Belt and braces: a touch that never became a pull (a tap, a gesture the
      // browser cancelled) must still take the hint off the wrapper.
      if (origin === null) {
        block.classList.remove('app__pull--pulling')
        return
      }
      const armed = delta >= ARM
      origin = null
      block.classList.add('app__pull--settle')
      ring.classList.add('app__ptr--settle')

      if (!armed) {
        rest()
        block.classList.remove('app__pull--pulling')
        return
      }

      busy = true
      block.style.transform = 'translateY(56px)'
      ring.style.transform = 'translateY(8px) scale(1)'
      ring.classList.add('app__ptr--spin')
      router.refresh()

      window.setTimeout(() => {
        ring.classList.remove('app__ptr--spin', 'app__ptr--armed')
        rest()
        block.classList.remove('app__pull--pulling')
        showToast(APP_STRINGS.ui.refreshed(clockLabel(new Date())))
        busy = false
      }, SPIN_MS)
    }

    const onStart = (event: TouchEvent) => start(event.touches[0]?.clientY ?? 0, event.target)
    const onMove = (event: TouchEvent) => move(event.touches[0]?.clientY ?? 0, event)

    scroller.addEventListener('touchstart', onStart, { passive: true })
    scroller.addEventListener('touchmove', onMove, { passive: false })
    scroller.addEventListener('touchend', end)
    scroller.addEventListener('touchcancel', end)
    return () => {
      scroller.removeEventListener('touchstart', onStart)
      scroller.removeEventListener('touchmove', onMove)
      scroller.removeEventListener('touchend', end)
      scroller.removeEventListener('touchcancel', end)
    }
  }, [router, showToast])

  return (
    <>
      <div className="app__ptr" ref={ptr} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle ref={arc} cx="12" cy="12" r="9" />
        </svg>
      </div>

      <div className="app__pull" ref={pull}>
        {children}
      </div>

      <div className={`app__toast${toast ? ' app__toast--on' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  )
}
