import React from 'react'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT } from '@/lib/admin-i18n'
import { showFill, type DashboardShow } from '@/lib/dashboard/capacity'
import { ShowFillBar } from './ShowFillBar'
import { accentNumberStyle, formatShowDate, venueLabel } from './format'

// Upcoming-show-first hero (#238): the NEXT show as a prominent card with a
// large capacity fill bar + a big remaining-seats figure, then the following
// 2-3 shows as smaller fill bars. Past shows are NOT here (they collapse to a
// de-emphasised reference list elsewhere). Dark-mode safe; gold/Bodoni only on
// the remaining-seats hero number.
export function UpcomingHero({
  upcoming,
  lang,
}: {
  upcoming: DashboardShow[]
  lang: AdminLang
}) {
  if (upcoming.length === 0) {
    return (
      <p
        style={{
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 8,
          padding: 20,
          color: 'var(--theme-elevation-600)',
          marginBottom: 24,
        }}
      >
        {adminT(lang, 'noUpcomingShows')}
      </p>
    )
  }

  const [next, ...rest] = upcoming
  const following = rest.slice(0, 3)
  const fill = showFill(next)

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Hero: next show */}
      <div
        style={{
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 10,
          padding: 24,
          marginBottom: following.length > 0 ? 16 : 0,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: 'var(--theme-elevation-500)',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 8,
          }}
        >
          {adminT(lang, 'nextShow')}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--theme-text)' }}>
              {formatShowDate(next.date, lang)}
            </div>
            <div style={{ fontSize: 15, color: 'var(--theme-elevation-600)', marginTop: 2 }}>
              {next.time} · {venueLabel(next.venue, lang)}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={accentNumberStyle(40)}>{Math.max(0, fill.remaining)}</div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--theme-elevation-500)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              {adminT(lang, 'remainingSeats')} · {fill.percent}%
            </div>
          </div>
        </div>

        {/* Large fill bar (header suppressed — date/venue shown above). */}
        <ShowFillBar show={next} lang={lang} showHeader={false} />

        {/* in-person sale (record per-show) graft here (#238 follow-up: inline
            on the card per ADR-0015); inquiries badge (#239) graft near actions. */}
      </div>

      {/* Following 2-3 shows as smaller fill bars */}
      {following.length > 0 && (
        <div>
          <h2
            style={{
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: 'var(--theme-elevation-500)',
              margin: '0 0 10px',
            }}
          >
            {adminT(lang, 'upcomingShows')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            {following.map((s) => (
              <div
                key={s.id}
                style={{
                  background: 'var(--theme-elevation-0)',
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <ShowFillBar show={s} lang={lang} compact />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
