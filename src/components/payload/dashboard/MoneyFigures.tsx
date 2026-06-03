import React from 'react'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { eur } from '../stats-blocks'

// Self-contained money slot for the admin dashboard (#237, ADR-0015). Takes only
// the active language + the two already-computed cent amounts; it does no data
// access and holds no business logic. The coordinator can graft this into the
// restructured season band (#238) by passing the same three props.
//
// The two figures are ALWAYS rendered as two distinct, labelled cards and are
// never summed. The word "profit" appears nowhere — the system has no cost data,
// so there is no bottom line to show.
export function MoneyFigures({
  lang,
  revenueCollectedCents,
  partnerReceivableCents,
}: {
  lang: AdminLang
  revenueCollectedCents: number
  partnerReceivableCents: number
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}
    >
      <MoneyCard
        label={adminT(lang, 'revenueCollected')}
        value={eur(revenueCollectedCents)}
        accent
      />
      <MoneyCard
        label={adminT(lang, 'partnerReceivable')}
        sublabel={adminT(lang, 'invoicedMonthly')}
        value={eur(partnerReceivableCents)}
      />
    </div>
  )
}

function MoneyCard({
  label,
  sublabel,
  value,
  accent,
}: {
  label: string
  sublabel?: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 6,
        padding: '14px 16px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: 'var(--theme-elevation-500)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
        {sublabel ? (
          <span style={{ textTransform: 'none', marginLeft: 6 }}>{sublabel}</span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accent ? 'var(--color-gold, #b8860b)' : 'var(--theme-text)',
        }}
      >
        {value}
      </div>
    </div>
  )
}
