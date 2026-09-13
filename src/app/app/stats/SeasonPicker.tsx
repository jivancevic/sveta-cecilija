'use client'

import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'

// The one control on Statistika, and the only reason any of it is client-side:
// a `<select>` that navigates. The same shape the scoreboard's picker has on
// Ljestvica, pointed at this screen's own route, so `?season=` means the same
// year wherever it is read.

export function SeasonPicker({ season, seasons }: { season: number; seasons: number[] }) {
  const router = useRouter()

  return (
    <div className="app__stats-season">
      <label className="app__stats-label" htmlFor="stats-season">
        {APP_STRINGS.statistics.season}
      </label>
      <select
        id="stats-season"
        className="app__select"
        value={String(season)}
        onChange={(e) => router.push(`/app/stats?season=${e.target.value}`)}
      >
        {seasons.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )
}
