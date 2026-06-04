import React from 'react'
import type { PartnerSeasonStats } from '@/lib/partner/partner-stats'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { StatementDownload } from './StatementDownload'
import { StatistikaChart } from './StatistikaChart'

// Partner dashboard "Statistika" + monthly-statement panel (#146, revamped). The
// per-show table became a stacked bar chart (tickets sold per izvedba). Server
// component — it receives already-scoped data (the dashboard derives the partner
// id from the authed user and queries scoped to it), so it never sees another
// partner's numbers.

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
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{adminT(lang, 'statistics')}</h2>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{stats.totalActive}</span>
          <span style={{ color: 'var(--theme-elevation-600)', fontSize: 14 }}>{adminT(lang, 'soldThisSeason')}</span>
        </div>

        {stats.perShow.length === 0 ? (
          <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>{adminT(lang, 'yourSalesEmpty')}</p>
        ) : (
          <StatistikaChart perShow={stats.perShow} lang={lang} />
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
