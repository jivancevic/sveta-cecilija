import React from 'react'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT } from '@/lib/admin-i18n'
import { showFill, type DashboardShow } from '@/lib/dashboard/capacity'
import { GOLD, formatShowDate, venueLabel } from './format'

// Capacity fill bar for one show. Used in two sizes:
//   - the next-show hero (UpcomingHero) renders it large
//   - the following 2-3 shows render it small ("compact")
// Dark-mode safe via --theme-elevation-*; the fill track uses brand gold so the
// "how full is this show" signal reads at a glance without a full reskin.
export function ShowFillBar({
  show,
  lang,
  compact = false,
}: {
  show: DashboardShow
  lang: AdminLang
  compact?: boolean
}) {
  const fill = showFill(show)
  const cancelled = show.status === 'cancelled'
  const barHeight = compact ? 8 : 12

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 14 : 16,
              fontWeight: 700,
              color: 'var(--theme-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {formatShowDate(show.date, lang)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            {show.time} · {venueLabel(show.venue, lang)}
            {cancelled ? ` · ${adminT(lang, 'cancelled')}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: GOLD }}>
            {fill.percent}%
          </span>
        </div>
      </div>

      <div
        style={{
          height: barHeight,
          borderRadius: barHeight,
          background: 'var(--theme-elevation-100)',
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-valuenow={fill.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            width: `${fill.percent}%`,
            height: '100%',
            background: cancelled ? 'var(--theme-elevation-300)' : GOLD,
            borderRadius: barHeight,
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 12,
          color: 'var(--theme-elevation-600)',
        }}
      >
        <span>
          {adminT(lang, 'sold')}: {fill.sold} / {fill.capacity}
        </span>
        <span>
          {adminT(lang, 'remainingSeats')}: <strong style={{ color: 'var(--theme-text)' }}>{Math.max(0, fill.remaining)}</strong>
        </span>
      </div>
    </div>
  )
}
