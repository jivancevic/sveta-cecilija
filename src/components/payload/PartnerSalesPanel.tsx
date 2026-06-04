import React from 'react'
import type { PartnerSeasonStats } from '@/lib/partner/partner-stats'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { StatementDownload } from './StatementDownload'

// Partner dashboard "your sales" + statement panel (#146, revamped). The recent-
// sales list moved to PartnerRecentSales (merged with same-day storno); this now
// owns the per-show season breakdown and the monthly reconciliation download.
// Server component — it receives already-scoped data (the dashboard derives the
// partner id from the authed user and queries scoped to it), so it never sees
// another partner's numbers.

const card: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: 20,
}

export function PartnerSalesPanel({ stats, lang }: { stats: PartnerSeasonStats; lang: AdminLang }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{adminT(lang, 'yourSales')}</h2>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{stats.totalActive}</span>
          <span style={{ color: 'var(--theme-elevation-600)', fontSize: 14 }}>
            {adminT(lang, 'soldThisSeason')}
          </span>
        </div>

        {stats.perShow.length === 0 ? (
          <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>
            {adminT(lang, 'yourSalesEmpty')}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--theme-elevation-500)' }}>
                <th style={th}>{adminT(lang, 'showWord')}</th>
                <th style={thNum}>{adminT(lang, 'adults')}</th>
                <th style={thNum}>{adminT(lang, 'children')}</th>
                <th style={thNum}>{adminT(lang, 'total')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.perShow.map((s) => (
                <tr key={s.showId} style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
                  <td style={td}>{s.showLabel}</td>
                  <td style={tdNum}>{s.adults}</td>
                  <td style={tdNum}>{s.children}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>{adminT(lang, 'monthlyStatement')}</h2>
        <p style={{ color: 'var(--theme-elevation-600)', fontSize: 13, margin: '0 0 14px' }}>
          {adminT(lang, 'monthlyStatementDesc')}
        </p>
        <StatementDownload lang={lang} />
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 }
const thNum: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '8px', color: 'var(--theme-text)' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' }
