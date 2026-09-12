import React from 'react'
import Link from 'next/link'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT, type DashboardStringKey } from '@/lib/admin-i18n'
import {
  seasonTrajectory,
  TRAJECTORY_CHANNELS,
  type TrajectoryBar,
  type TrajectoryChannel,
} from '@/lib/dashboard/trajectory'
import type { DashboardShow } from '@/lib/dashboard/partition'
import type { ShowChannelCounts } from '@/lib/tickets/sold-seats'
import {
  CHANNEL_COLORS,
  SECTION_LABEL_STYLE,
  formatShowDate,
  shortShowDate,
  venueLabel,
} from './format'

// SEASON-TRAJECTORY BAR CHART (#242, ADR-0015). One bar per show across the whole
// season, chronological: the fill is tickets sold, the faint track behind it is
// that venue's capacity ceiling. All bars share one y-scale (the season's
// tallest capacity), so a ljetno-kino (350) sell-out reads taller than a
// zimsko-kino (250) one. Each bar links to that show's stats drill-down. Payload
// theme tokens keep the surface dark-mode safe; only the fills use brand colours.
//
// The fill is STACKED by seat origin — online, at the door, partner, comp —
// bottom-to-top in that order, sharing the ChannelMixChart palette so the two
// charts teach the same colour vocabulary. The segments sum to the show's `sold`
// by construction (trajectory.ts derives the at-the-door block as the
// remainder), so the stack height still matches the number above it and the
// figure on the show card. A cancelled show drops to one flat grey block: its
// seats no longer mean anything worth splitting apart.
//
// Server component: each bar is a plain <Link> (no client JS), matching the
// PastShowsList row pattern. Horizontally scrollable so a full 22-show season
// never crushes the bars.

const CHART_HEIGHT = 132 // px, the y-axis travel for a full-capacity venue

const CHANNEL_LABEL_KEY: Record<TrajectoryChannel, DashboardStringKey> = {
  online: 'channelOnline',
  inPerson: 'channelInPerson',
  partner: 'channelPartner',
  comp: 'channelComp',
}

export function SeasonTrajectoryChart({
  shows,
  channelsByShow,
  lang,
}: {
  shows: DashboardShow[]
  channelsByShow: Map<string, ShowChannelCounts>
  lang: AdminLang
}) {
  const { bars, maxCapacity } = seasonTrajectory(shows, channelsByShow)
  if (bars.length === 0) return null

  return (
    <section style={{ marginTop: 28 }}>
      <div style={SECTION_LABEL_STYLE}>{adminT(lang, 'seasonTrajectory')}</div>

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

      {/* Legend: what each block in the stack means, in stack order. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 20px',
          marginTop: 12,
        }}
      >
        {TRAJECTORY_CHANNELS.map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: CHANNEL_COLORS[key],
                flexShrink: 0,
              }}
              aria-hidden
            />
            <span style={{ fontSize: 13, color: 'var(--theme-text)' }}>
              {adminT(lang, CHANNEL_LABEL_KEY[key])}
            </span>
          </div>
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
  // Ceiling height = this venue's capacity against the season's tallest; the
  // stack is sold against the same scale, capped at the ceiling so an oversold
  // show never pokes above its own capacity line. Each segment takes its share
  // of that capped height, so the blocks together are exactly as tall as the
  // old single fill was.
  const ceilingPx = maxCapacity > 0 ? (bar.capacity / maxCapacity) * CHART_HEIGHT : 0
  const shownSold = Math.min(bar.sold, bar.capacity)
  const soldPx = maxCapacity > 0 ? (shownSold / maxCapacity) * CHART_HEIGHT : 0
  // Segments are measured per seat against the (possibly capped) stack height,
  // so they still add up to soldPx even on an oversold show.
  const pxPerSeat = bar.sold > 0 ? soldPx / bar.sold : 0

  const breakdown = bar.segments
    .filter((s) => s.count > 0)
    .map((s) => `${adminT(lang, CHANNEL_LABEL_KEY[s.key])} ${s.count}`)
    .join(', ')
  const label =
    `${formatShowDate(bar.date, lang)} · ${venueLabel(bar.venue, lang)} — ` +
    `${bar.sold} / ${bar.capacity} (${bar.percent}%)` +
    (breakdown ? ` — ${breakdown}` : '')

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

      {/* Capacity ceiling track; the stack is anchored to its bottom and grows
          upward, so the first segment in display order sits lowest. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: ceilingPx,
          background: 'var(--theme-elevation-100)',
          borderRadius: 3,
          display: 'flex',
          flexDirection: 'column-reverse',
          overflow: 'hidden',
        }}
        role="img"
        aria-hidden
      >
        {bar.cancelled ? (
          <div
            style={{
              width: '100%',
              height: soldPx,
              flexShrink: 0,
              background: 'var(--theme-elevation-300)',
            }}
          />
        ) : (
          bar.segments
            .filter((s) => s.count > 0)
            .map((s) => (
              <div
                key={s.key}
                style={{
                  width: '100%',
                  height: s.count * pxPerSeat,
                  flexShrink: 0,
                  background: CHANNEL_COLORS[s.key],
                }}
              />
            ))
        )}
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
