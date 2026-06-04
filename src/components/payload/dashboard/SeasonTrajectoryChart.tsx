import React from 'react'
import Link from 'next/link'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT } from '@/lib/admin-i18n'
import { seasonTrajectory, type TrajectoryBar } from '@/lib/dashboard/trajectory'
import type { DashboardShow } from '@/lib/dashboard/partition'
import { GOLD, formatShowDate, shortShowDate, venueLabel } from './format'

// SEASON-TRAJECTORY BAR CHART (#242, ADR-0015). One bar per show across the whole
// season, chronological: the gold fill is tickets sold, the faint track behind it
// is that venue's capacity ceiling. All bars share one y-scale (the season's
// tallest capacity), so a ljetno-kino (320) sell-out reads taller than a
// zimsko-kino (250) one. Each bar links to that show's stats drill-down. Payload
// theme tokens keep the surface dark-mode safe; only the fill uses brand gold.
//
// Server component: each bar is a plain <Link> (no client JS), matching the
// PastShowsList row pattern. Horizontally scrollable so a full 22-show season
// never crushes the bars.

const CHART_HEIGHT = 132 // px, the y-axis travel for a full-capacity venue

export function SeasonTrajectoryChart({
  shows,
  lang,
}: {
  shows: DashboardShow[]
  lang: AdminLang
}) {
  const { bars, maxCapacity } = seasonTrajectory(shows)
  if (bars.length === 0) return null

  return (
    <section style={{ marginTop: 28 }}>
      <div
        style={{
          fontSize: 12,
          color: 'var(--theme-elevation-500)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 12,
        }}
      >
        {adminT(lang, 'seasonTrajectory')}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
        }}
      >
        {bars.map((bar) => (
          <TrajectoryColumn key={bar.id} bar={bar} maxCapacity={maxCapacity} lang={lang} />
        ))}
      </div>
    </section>
  )
}

function TrajectoryColumn({
  bar,
  maxCapacity,
  lang,
}: {
  bar: TrajectoryBar
  maxCapacity: number
  lang: AdminLang
}) {
  // Ceiling height = this venue's capacity against the season's tallest; fill =
  // sold against the same scale, capped at the ceiling so an oversold show never
  // pokes above its own capacity line.
  const ceilingPx = maxCapacity > 0 ? (bar.capacity / maxCapacity) * CHART_HEIGHT : 0
  const soldPx = maxCapacity > 0 ? (Math.min(bar.sold, bar.capacity) / maxCapacity) * CHART_HEIGHT : 0

  const label = `${formatShowDate(bar.date, lang)} · ${venueLabel(bar.venue, lang)} — ${bar.sold} / ${bar.capacity} (${bar.percent}%)`

  return (
    <Link
      href={`/admin/stats/${bar.id}`}
      title={label}
      aria-label={label}
      style={{
        flex: '1 0 28px',
        maxWidth: 64,
        minWidth: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textDecoration: 'none',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--theme-elevation-600)', marginBottom: 4 }}>
        {bar.sold}
      </div>

      {/* Capacity ceiling track; the sold fill is anchored to its bottom. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: ceilingPx,
          background: 'var(--theme-elevation-100)',
          borderRadius: 3,
          display: 'flex',
          alignItems: 'flex-end',
        }}
        role="img"
        aria-hidden
      >
        <div
          style={{
            width: '100%',
            height: soldPx,
            background: bar.cancelled ? 'var(--theme-elevation-300)' : GOLD,
            borderRadius: 3,
          }}
        />
      </div>

      <div
        style={{
          fontSize: 10,
          color: 'var(--theme-elevation-500)',
          marginTop: 6,
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {shortShowDate(bar.date, lang)}
      </div>
    </Link>
  )
}
