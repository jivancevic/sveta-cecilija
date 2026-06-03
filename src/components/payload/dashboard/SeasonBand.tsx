import React from 'react'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT } from '@/lib/admin-i18n'
import type { SeasonCapacity } from '@/lib/dashboard/capacity'
import { GOLD, accentNumberStyle } from './format'
import { MoneyFigures } from './MoneyFigures'

// Persistent SEASON SUMMARY BAND (ADR-0015 / #238): revenue collected + partner
// receivable + tickets sold + % of season capacity, visible without scrolling.
// Sticky to the top of the scroll area so it stays in view as the secretary
// scrolls the shows below. Payload-native surface, gold/Bodoni accents on the
// figures only; dark-mode safe via --theme-elevation-*.
export function SeasonBand({
  lang,
  season,
  revenueCents,
  partnerReceivableCents,
}: {
  lang: AdminLang
  season: SeasonCapacity
  revenueCents: number
  partnerReceivableCents?: number
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: '16px 18px',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: 'var(--theme-elevation-500)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 12,
        }}
      >
        {adminT(lang, 'seasonSummary')}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
          alignItems: 'end',
        }}
      >
        {/* money figures (#237) graft here — MoneyFigures owns the two euro tiles */}
        <MoneyFigures
          lang={lang}
          revenueCents={revenueCents}
          partnerReceivableCents={partnerReceivableCents}
        />

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--theme-elevation-500)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 4,
            }}
          >
            {adminT(lang, 'ticketsSold')}
          </div>
          <div style={accentNumberStyle(24)}>{season.totalSold}</div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--theme-elevation-500)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 4,
            }}
          >
            {adminT(lang, 'seasonCapacity')}
          </div>
          <div style={accentNumberStyle(24)}>{season.percent}%</div>
          <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginTop: 2 }}>
            {season.totalSold} / {season.totalCapacity}
          </div>
        </div>
      </div>

      {/* Season-fill bar mirrors the per-show bars below. */}
      <div
        style={{
          marginTop: 14,
          height: 8,
          borderRadius: 8,
          background: 'var(--theme-elevation-100)',
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-valuenow={season.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${season.percent}%`, height: '100%', background: GOLD }} />
      </div>
    </div>
  )
}
