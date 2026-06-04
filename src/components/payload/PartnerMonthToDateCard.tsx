import React from 'react'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import type { MonthToDate } from '@/lib/partner/month-to-date'

// Live month-to-date standing card for the partner dashboard (#241, ADR-0015).
// Server component: it receives already-scoped, already-computed figures (the
// dashboard derives the partner id from the authed user and queries scoped to
// it), so this never sees another partner's numbers. Dark-mode safe via theme
// tokens; the two key euros (owed / commission) carry the gold/Bodoni accent.

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`

export function PartnerMonthToDateCard({
  data,
  monthLabel,
  lang,
}: {
  data: MonthToDate
  monthLabel: string
  lang: AdminLang
}) {
  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>{adminT(lang, 'mtdThisMonth')}</h2>
        <span style={{ fontSize: 13, color: 'var(--theme-elevation-500)' }}>{monthLabel}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <Figure label={adminT(lang, 'mtdTicketsSold')} value={String(data.ticketsSold)} />
        <Figure label={adminT(lang, 'mtdOwed')} value={eur(data.owedCents)} accent />
        <Figure label={adminT(lang, 'mtdCommission')} value={eur(data.commissionCents)} accent />
      </div>

      <p style={{ fontSize: 12, color: 'var(--theme-elevation-500)', margin: '14px 0 0' }}>
        {adminT(lang, 'mtdLiveNote')}
      </p>
    </div>
  )
}

function Figure({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--theme-elevation-0)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 6,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--theme-elevation-500)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.05,
          fontFamily: accent ? 'var(--font-bodoni), serif' : undefined,
          color: accent ? 'var(--theme-warning-600, #b8860b)' : 'var(--theme-text)',
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 11, color: 'var(--theme-elevation-500)', marginTop: 4 }}>{sub}</div>
      ) : null}
    </div>
  )
}
