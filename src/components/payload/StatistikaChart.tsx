'use client'

import React from 'react'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import type { PerShowCount } from '@/lib/partner/partner-stats'
import { GOLD } from './dashboard/format'

// Statistika: stacked bar chart of the partner's own tickets sold per izvedba
// (gold = adults, paler gold = children). Scaled to the partner's OWN busiest
// izvedba (not venue capacity — a partner sells a sliver of a 320-seat house).
// Responsive orientation: horizontal rows on phone, vertical admin-style columns
// on desktop, switched via matchMedia (the sanctioned external-system effect).
const CHILD_FILL = 'rgba(184, 136, 26, 0.4)' // paler gold for the children segment
const VERT_HEIGHT = 120

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

export function StatistikaChart({ perShow, lang }: { perShow: PerShowCount[]; lang: AdminLang }) {
  // Desktop ⇒ vertical columns; phone ⇒ horizontal rows. Default mobile-first.
  const [vertical, setVertical] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)')
    const update = () => setVertical(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const maxTotal = Math.max(1, ...perShow.map((p) => p.total))

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
          {perShow.map((p) => {
            const aPx = (p.adults / maxTotal) * VERT_HEIGHT
            const cPx = (p.children / maxTotal) * VERT_HEIGHT
            return (
              <div key={p.showId} title={`${shortDate(p.showDate, lang)} — ${p.adults} + ${p.children} = ${p.total}`} style={vCol}>
                <div style={{ fontSize: 11, color: 'var(--theme-elevation-600)', marginBottom: 4 }}>{p.total}</div>
                <div style={{ width: '100%', height: VERT_HEIGHT, background: 'var(--theme-elevation-100)', borderRadius: 3, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: aPx, background: GOLD }} />
                  <div style={{ width: '100%', height: cPx, background: CHILD_FILL }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--theme-elevation-500)', marginTop: 6, whiteSpace: 'nowrap', textAlign: 'center' }}>{shortDate(p.showDate, lang)}</div>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {perShow.map((p) => {
          const aPct = (p.adults / maxTotal) * 100
          const cPct = (p.children / maxTotal) * 100
          return (
            <div key={p.showId} style={{ display: 'flex', alignItems: 'center', gap: 10 }} title={`${p.adults} + ${p.children} = ${p.total}`}>
              <div style={{ width: 56, flex: '0 0 auto', fontSize: 12, color: 'var(--theme-elevation-600)' }}>{shortDate(p.showDate, lang)}</div>
              <div style={{ flex: 1, minWidth: 0, height: 16, background: 'var(--theme-elevation-100)', borderRadius: 3, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: `${aPct}%`, background: GOLD }} />
                <div style={{ width: `${cPct}%`, background: CHILD_FILL }} />
              </div>
              <div style={{ width: 24, flex: '0 0 auto', textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{p.total}</div>
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
