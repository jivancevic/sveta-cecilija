'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS, KIND_LABELS } from '@/lib/app/strings'
import { PERFORMANCE_KINDS } from '@/lib/show-performance'
import type { DancerStats } from '@/lib/lineup/stats'

// The season scoreboard (#437).
//
// Client-side for exactly two reasons: the season dropdown navigates, and
// tapping a row reveals that dancer's split by performance kind (story 40).
// Everything else is server-rendered data — the counting happens in
// `aggregateDancerStats` and nothing is recomputed here.
//
// The split is a detail row rather than four more columns: on a phone the table
// already carries five numbers, and "od toga 6 redovnih, 2 DMC" is a question
// asked about one dancer at a time.

export function StatsTable({
  rows,
  season,
  seasons,
}: {
  rows: DancerStats[]
  season: number
  seasons: number[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <div className="app__stats-season">
        <label className="app__stats-label" htmlFor="stats-season">
          {APP_STRINGS.stats.season}
        </label>
        <select
          id="stats-season"
          className="app__select"
          value={String(season)}
          onChange={(e) => router.push(`/app/leaderboard?season=${e.target.value}&part=all`)}
        >
          {seasons.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <p className="app__stats-hint">{APP_STRINGS.stats.hint}</p>

      {rows.length === 0 ? (
        <p className="app__empty">{APP_STRINGS.stats.noRoster}</p>
      ) : (
        <table className="app__stats">
          <thead>
            <tr>
              <th scope="col">{APP_STRINGS.stats.dancer}</th>
              <th scope="col">{APP_STRINGS.stats.performances}</th>
              <th scope="col" title={APP_STRINGS.stats.crniKralj}>
                CK
              </th>
              <th scope="col" title={APP_STRINGS.stats.biliKralj}>
                BK
              </th>
              <th scope="col" title={APP_STRINGS.stats.otmanovic}>
                Otm
              </th>
              <th scope="col" title={APP_STRINGS.stats.bula}>
                Bula
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = open === row.memberId
              return [
                <tr
                  key={row.memberId}
                  className="app__stats-row"
                  onClick={() => setOpen(expanded ? null : row.memberId)}
                  aria-expanded={expanded}
                >
                  <th scope="row">{row.nickname}</th>
                  <td>{row.performances}</td>
                  <td>{row.roles.crni_kralj}</td>
                  <td>{row.roles.bili_kralj}</td>
                  <td>{row.roles.otmanovic}</td>
                  <td>{row.roles.bula}</td>
                </tr>,
                expanded ? (
                  <tr key={`${row.memberId}-kinds`} className="app__stats-detail">
                    <td colSpan={6}>
                      <span className="app__stats-label">{APP_STRINGS.stats.byKind}</span>{' '}
                      {PERFORMANCE_KINDS.filter((kind) => row.byKind[kind] > 0)
                        .map((kind) => `${row.byKind[kind]} ${KIND_LABELS[kind]}`)
                        .join(', ') || '0'}
                    </td>
                  </tr>
                ) : null,
              ]
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
