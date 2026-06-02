import React from 'react'
import type { PartnerSeasonStats, RecentSale } from '@/lib/partner/partner-stats'
import { StatementDownload } from './StatementDownload'

// Partner dashboard sales panel (#146). Renders the partner's own season total,
// per-show active counts, recent sales, and a month-picker download link to the
// reconciliation export. Server component — it receives already-scoped data
// (the dashboard derives the partner id from the authed user and queries scoped
// to it), so this never sees another partner's numbers.

const card: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: 20,
}

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`

function formatDateTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zagreb',
  })
}

export function PartnerSalesPanel({
  stats,
  recent,
  commissionPercent,
}: {
  stats: PartnerSeasonStats
  recent: RecentSale[]
  commissionPercent: number
}) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Your sales</h2>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{stats.totalActive}</span>
          <span style={{ color: 'var(--theme-elevation-600)', fontSize: 14 }}>
            ticket{stats.totalActive === 1 ? '' : 's'} sold this season
          </span>
        </div>

        {stats.perShow.length === 0 ? (
          <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>
            No sales yet. Issued tickets will appear here.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--theme-elevation-500)' }}>
                <th style={th}>Show</th>
                <th style={thNum}>Adults</th>
                <th style={thNum}>Children</th>
                <th style={thNum}>Total</th>
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
        <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Recent sales</h2>
        {recent.length === 0 ? (
          <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>No sales yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--theme-elevation-500)' }}>
                <th style={th}>When</th>
                <th style={th}>Ref</th>
                <th style={th}>Show</th>
                <th style={thNum}>Tickets</th>
                <th style={thNum}>Total</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.orderId} style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
                  <td style={td}>{formatDateTime(r.createdAt)}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{r.code ?? '—'}</td>
                  <td style={td}>{r.showLabel}</td>
                  <td style={tdNum}>{r.adultCount + r.childCount}</td>
                  <td style={tdNum}>{eur(r.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Monthly statement</h2>
        <p style={{ color: 'var(--theme-elevation-600)', fontSize: 13, margin: '0 0 14px' }}>
          A monthly breakdown of sales, cancellations, and your {commissionPercent}% commission. Pick a
          month and download the reconciliation.
        </p>
        <StatementDownload />
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 }
const thNum: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '8px', color: 'var(--theme-text)' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' }
