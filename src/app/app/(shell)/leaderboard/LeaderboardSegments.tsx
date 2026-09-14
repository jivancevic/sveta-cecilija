'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { LEADERBOARD_SEGMENTS, type LeaderboardSegment } from '@/lib/app/leaderboard-loaders'
import { Seasons, Segmented } from '../../ui'

// The two panels of the Ljestvica screen (#457, #495, reskinned in #568):
// "Ljestvica" and "Moja sezona", in that order since Q36.
//
// Both panels are SERVER-rendered and arrive as children, and this component
// owns exactly one thing: which one is on screen. Switching costs no request
// and leaks no roster query into the browser.
//
// The season links live here rather than in the page because their href has to
// carry the segment: a dancer reading the 2025 board and tapping "2024" is
// asking for the 2024 board, not to be dropped back into their own season.
// `history.replaceState` keeps `?part=` honest without stacking history
// entries, so Back leaves the tab rather than walking the toggle backwards.

const PANEL = 'app-leaderboard-panel'

export function LeaderboardSegments({
  initial,
  season,
  seasons,
  mine,
  all,
}: {
  initial: LeaderboardSegment
  season: number
  seasons: readonly number[]
  mine: React.ReactNode
  all: React.ReactNode
}) {
  const [segment, setSegment] = useState<LeaderboardSegment>(initial)

  function show(next: LeaderboardSegment) {
    setSegment(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('part', next)
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <>
      <Segmented
        items={LEADERBOARD_SEGMENTS.map((key) => ({
          key,
          label: APP_STRINGS.mySeason.segments[key],
        }))}
        value={segment}
        onSelect={show}
        label={APP_STRINGS.screens.leaderboard}
        panelId={PANEL}
      />

      {/* A row of pills rather than the bordered box the old nav drew, which
          framed a single year in a full-width rectangle. The links stay links:
          a season is a server navigation and carries `?part=` with it. The
          pills themselves moved into `ui/` with #571, when Statistika and
          Financije needed the same row. */}
      <Seasons
        seasons={seasons}
        season={season}
        href={(year) => `/app/leaderboard?season=${year}&part=${segment}`}
        label={APP_STRINGS.mySeason.season}
      />

      <div id={PANEL} role="tabpanel" aria-labelledby={`${PANEL}-${segment}`}>
        {segment === 'mine' ? mine : all}
      </div>
    </>
  )
}
