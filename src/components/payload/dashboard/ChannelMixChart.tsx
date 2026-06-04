import React from 'react'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT, type DashboardStringKey } from '@/lib/admin-i18n'
import { channelMix, type ChannelKey } from '@/lib/dashboard/channel-mix'
import { CHANNEL_COLORS } from './format'

// CHANNEL-MIX SPLIT (#242, ADR-0015). Where the season's seats came from —
// online (Stripe) vs in-person (box office) vs partner (resellers) — as a single
// stacked bar plus a legend. The segment widths are driven by raw counts
// (flexGrow), so the visual is exact even though each legend percent is rounded
// independently. Palette anchored on the brand gold (online); dark-mode safe via
// fixed brand colours on the bar and theme tokens on the surface.

const CHANNEL_LABEL_KEY: Record<ChannelKey, DashboardStringKey> = {
  online: 'channelOnline',
  inPerson: 'channelInPerson',
  partner: 'channelPartner',
}

export function ChannelMixChart({
  counts,
  lang,
}: {
  counts: { online: number; inPerson: number; partner: number }
  lang: AdminLang
}) {
  const mix = channelMix(counts)

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
        {adminT(lang, 'salesChannels')}
      </div>

      {mix.total === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--theme-elevation-500)' }}>
          {adminT(lang, 'noSalesYet')}
        </div>
      ) : (
        <>
          {/* Stacked bar: exact widths from raw counts via flexGrow. */}
          <div
            style={{
              display: 'flex',
              height: 16,
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--theme-elevation-100)',
            }}
            role="img"
            aria-label={mix.segments
              .map((s) => `${adminT(lang, CHANNEL_LABEL_KEY[s.key])} ${s.count} (${s.percent}%)`)
              .join(', ')}
          >
            {mix.segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.key}
                  style={{ flexGrow: s.count, background: CHANNEL_COLORS[s.key] }}
                />
              ))}
          </div>

          {/* Legend: swatch · label · count · percent, in the same order. */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px 20px',
              marginTop: 12,
            }}
          >
            {mix.segments.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: CHANNEL_COLORS[s.key],
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
                <span style={{ fontSize: 13, color: 'var(--theme-text)' }}>
                  {adminT(lang, CHANNEL_LABEL_KEY[s.key])}
                </span>
                <span style={{ fontSize: 13, color: 'var(--theme-elevation-600)' }}>
                  {s.count} ({s.percent}%)
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
