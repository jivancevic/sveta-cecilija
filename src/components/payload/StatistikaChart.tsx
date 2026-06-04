'use client'

import React from 'react'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import type { StatBar } from '@/lib/partner/partner-stats'
import { GOLD } from './dashboard/format'

// Statistika: stacked bar chart of the partner's tickets sold across the WHOLE
// season — every izvedba, sold or not (gold = adults, paler gold = children).
// Scaled to the partner's OWN busiest izvedba (not venue capacity). Responsive:
// horizontal rows on phone, vertical admin-style columns on desktop (matchMedia).
// Adults sit at the BOTTOM of a vertical bar / on the LEFT of a horizontal bar.
// Bars grow in on mount, staggered, for a smooth reveal.
const CHILD_FILL = 'rgba(184, 136, 26, 0.4)'
const VERT_HEIGHT = 120
const GROW = 'cubic-bezier(0.22, 1, 0.36, 1)'

function localeOf(lang: AdminLang) {
  return lang === 'hr' ? 'hr-HR' : 'en-GB'
}
function shortDate(isoDate: string, lang: AdminLang): string {
  if (!isoDate) return ''
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(localeOf(lang), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export function StatistikaChart({ bars, lang }: { bars: StatBar[]; lang: AdminLang }) {
  const [vertical, setVertical] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)')
    const update = () => setVertical(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Grow the fills in from zero once, just after mount.
  const [grown, setGrown] = React.useState(false)
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const maxTotal = Math.max(1, ...bars.map((b) => b.total))
  const delay = (i: number) => `${Math.min(i, 16) * 25}ms`

  const legend = (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--theme-elevation-600)' }}>
      <Swatch color={GOLD} label={adminT(lang, 'adults')} />
      <Swatch color={CHILD_FILL} label={adminT(lang, 'children')} />
    </div>
  )

  if (vertical) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>{legend}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {bars.map((b, i) => {
            const aPx = grown ? (b.adults / maxTotal) * VERT_HEIGHT : 0
            const cPx = grown ? (b.children / maxTotal) * VERT_HEIGHT : 0
            const tr = `height 600ms ${GROW} ${delay(i)}`
            return (
              <div key={b.showId} title={`${shortDate(b.showDate, lang)} — ${b.adults} + ${b.children} = ${b.total}`} style={vCol}>
                <div style={{ fontSize: 11, color: 'var(--theme-elevation-600)', marginBottom: 4 }}>{b.total}</div>
                {/* column: children on top, adults at the bottom (justify flex-end) */}
                <div style={{ width: '100%', height: VERT_HEIGHT, background: 'var(--theme-elevation-100)', borderRadius: 3, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: cPx, background: CHILD_FILL, transition: tr }} />
                  <div style={{ width: '100%', height: aPx, background: GOLD, transition: tr }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--theme-elevation-500)', marginTop: 6, whiteSpace: 'nowrap', textAlign: 'center' }}>{shortDate(b.showDate, lang)}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>{legend}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {bars.map((b, i) => {
          const aPct = grown ? (b.adults / maxTotal) * 100 : 0
          const cPct = grown ? (b.children / maxTotal) * 100 : 0
          const tr = `width 600ms ${GROW} ${delay(i)}`
          return (
            <div key={b.showId} style={{ display: 'flex', alignItems: 'center', gap: 10 }} title={`${b.adults} + ${b.children} = ${b.total}`}>
              <div style={{ width: 56, flex: '0 0 auto', fontSize: 12, color: 'var(--theme-elevation-600)' }}>{shortDate(b.showDate, lang)}</div>
              {/* row: adults on the left, children on the right */}
              <div style={{ flex: 1, minWidth: 0, height: 16, background: 'var(--theme-elevation-100)', borderRadius: 3, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: `${aPct}%`, background: GOLD, transition: tr }} />
                <div style={{ width: `${cPct}%`, background: CHILD_FILL, transition: tr }} />
              </div>
              <div style={{ width: 24, flex: '0 0 auto', textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{b.total}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 11, height: 11, borderRadius: 2, background: color, flex: '0 0 auto' }} />
      {label}
    </span>
  )
}

const vCol: React.CSSProperties = {
  flex: '1 0 30px',
  maxWidth: 56,
  minWidth: 26,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}
