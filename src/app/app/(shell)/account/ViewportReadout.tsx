'use client'

import { useEffect, useState } from 'react'

// A diagnostics line for the `dev` holder only (ADR-0016's dev strip, on the
// phone): the numbers the tab-bar-height bug on an installed iPhone needs and
// that no desktop browser can produce. Read once on mount and again on every
// resize, so a rotation or a keyboard shows up too.
export function ViewportReadout() {
  const [line, setLine] = useState('…')

  useEffect(() => {
    const read = () => {
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:fixed;bottom:0;left:0;height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);visibility:hidden'
      document.body.appendChild(probe)
      const cs = getComputedStyle(probe)
      const safeTop = cs.paddingTop
      const safeBottom = cs.paddingBottom
      probe.style.height = '100dvh'
      probe.style.padding = '0'
      const dvh = probe.offsetHeight
      probe.style.height = '100svh'
      const svh = probe.offsetHeight
      probe.remove()
      const mmStandalone = window.matchMedia('(display-mode: standalone)').matches
      const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
      const vv = window.visualViewport
      setLine(
        [
          `inner ${window.innerWidth}×${window.innerHeight}`,
          `screen ${window.screen.width}×${window.screen.height}`,
          `visual ${vv ? Math.round(vv.height) : '-'}`,
          `html ${document.documentElement.clientHeight}`,
          `body ${document.body.clientHeight}`,
          `safe ${safeTop}/${safeBottom}`,
          `dvh ${dvh} · svh ${svh}`,
          `mode ${mmStandalone ? 'standalone' : 'browser'}/${navStandalone ? 'nav' : '-'}`,
          `shim ${getComputedStyle(document.body).getPropertyValue('--shim').trim() || '-'}`,
          `ua ${navigator.userAgent.replace(/^.*(OS \d+_\d+).*$/, '$1')}`,
        ].join(' · '),
      )
    }
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  return (
    <p className="app__setting-note" style={{ fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>
      {line}
    </p>
  )
}
