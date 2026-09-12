'use client'

import Link from 'next/link'
import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { MOJE_SEGMENTS, type MojeSegment } from '@/lib/app/leaderboard-loaders'

// The two panels of the Moje tab (#457): "Moja sezona" and "Ljestvica".
//
// The same shape as `DetailSegments`: both panels are SERVER-rendered and
// arrive as children, and this component owns exactly one thing, which one is
// on screen. Switching costs no request and leaks no roster query into the
// browser.
//
// The season links live here rather than in the page because their href has to
// carry the segment: a dancer reading the 2025 board and tapping "2024" is
// asking for the 2024 board, not to be dropped back into their own season.
// `history.replaceState` keeps `?dio=` honest without stacking history entries,
// so Back leaves the tab rather than walking the toggle backwards.

export function MojeSegments({
  initial,
  season,
  seasons,
  moja,
  ljestvica,
}: {
  initial: MojeSegment
  season: number
  seasons: readonly number[]
  moja: React.ReactNode
  ljestvica: React.ReactNode
}) {
  const [segment, setSegment] = useState<MojeSegment>(initial)

  function show(next: MojeSegment) {
    setSegment(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('dio', next)
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <>
      <div
        className="app__segments app__segments--two"
        role="tablist"
        aria-label={APP_STRINGS.mySeason.title}
      >
        {MOJE_SEGMENTS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`app-moje-${key}`}
            aria-controls="app-moje-panel"
            aria-selected={segment === key}
            className={`app__segment${segment === key ? ' app__segment--on' : ''}`}
            onClick={() => show(key)}
          >
            {APP_STRINGS.mySeason.segments[key]}
          </button>
        ))}
      </div>

      <nav className="app__seasons" aria-label={APP_STRINGS.mySeason.season}>
        {seasons.map((year) => (
          <Link
            key={year}
            href={`/app/moje?sezona=${year}&dio=${segment}`}
            className={`app__seasons-item${year === season ? ' app__seasons-item--on' : ''}`}
            aria-current={year === season ? 'page' : undefined}
          >
            {year}
          </Link>
        ))}
      </nav>

      <div
        id="app-moje-panel"
        role="tabpanel"
        aria-labelledby={`app-moje-${segment}`}
      >
        {segment === 'moja' ? moja : ljestvica}
      </div>
    </>
  )
}
