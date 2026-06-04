import React from 'react'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT } from '@/lib/admin-i18n'
import { eur, accentNumberStyle } from './format'

// SEAM for #237 (money figures). This is the basic placeholder the SeasonBand
// renders today: two SEPARATE facts, never summed and NEVER labelled "profit"
// (ADR-0015) — "Revenue collected" and "Partner receivable". Today both come
// from the simple inputs the dashboard already has; #237 replaces the body of
// this component with src/lib/dashboard/revenue.ts (true collected revenue net
// of refunds + in-person cash; partner receivable from the reconciliation
// modules) behind this exact <MoneyFigures lang … /> signature.
//
// money figures (#237) graft here — swap the figure sources, keep the two-tile
// shape, the labels, and the gold/Bodoni accent.
export function MoneyFigures({
  lang,
  revenueCents,
  partnerReceivableCents,
}: {
  lang: AdminLang
  /** Cash collected (cents). Today: online gross of non-refunded orders. */
  revenueCents: number
  /** Partner receivable (cents), invoiced monthly. Today: 0 until #237 wires it. */
  partnerReceivableCents?: number
}) {
  return (
    <>
      <Figure label={adminT(lang, 'revenueCollected')} value={eur(revenueCents)} />
      <Figure
        label={`${adminT(lang, 'partnerReceivable')} ${adminT(lang, 'invoicedMonthly')}`}
        value={eur(partnerReceivableCents ?? 0)}
      />
    </>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
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
        {label}
      </div>
      <div style={accentNumberStyle(24)}>{value}</div>
    </div>
  )
}
