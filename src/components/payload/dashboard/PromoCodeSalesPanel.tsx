'use client'

import React, { useState } from 'react'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT } from '@/lib/admin-i18n'
import type { PromoCodeSalesRow } from '@/lib/tickets/sold-seats'
import { ACCENT_FONT, GOLD, SECTION_LABEL_STYLE, eur } from './format'

// PROMO-CODE REPORTING PANEL (#325, ADR-0018). Lists the season's promo codes,
// top draw first, with the "show 3 → show more" expand pattern the partner
// panels use. Per code: the attributed member, the whole-party tickets sold
// (every active ticket, adult + child, on any order that applied the code) and
// the revenue kept. Cancelled/refunded seats are already excluded upstream by
// the active-ticket count, so the figures self-heal on a refund. Admin-tier
// only — rendered from AdminDashboardView, which gates on the role.

const TOP_N = 3

const pillBtn: React.CSSProperties = {
  marginTop: 14,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 999,
  color: 'var(--theme-text)',
  cursor: 'pointer',
}

export function PromoCodeSalesPanel({
  rows,
  lang,
}: {
  rows: PromoCodeSalesRow[]
  lang: AdminLang
}) {
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? rows : rows.slice(0, TOP_N)
  const hasMore = rows.length > TOP_N

  return (
    <section style={{ marginTop: 28 }}>
      <div style={SECTION_LABEL_STYLE}>{adminT(lang, 'promoCodes')}</div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--theme-elevation-500)' }}>
          {adminT(lang, 'noPromoCodes')}
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--theme-elevation-500)', margin: '0 0 12px' }}>
            {adminT(lang, 'promoCodesDesc')}
          </p>

          {/* Header row */}
          <div style={rowStyle(true)}>
            <span>{adminT(lang, 'promoCodeMember')}</span>
            <span style={{ textAlign: 'right' }}>{adminT(lang, 'promoCodeTickets')}</span>
            <span style={{ textAlign: 'right' }}>{adminT(lang, 'promoCodeRevenue')}</span>
          </div>

          {visible.map((r) => (
            <div key={r.promoCodeId} style={rowStyle(false)}>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), ui-monospace, monospace',
                    fontWeight: 700,
                    color: GOLD,
                    letterSpacing: 0.4,
                  }}
                >
                  {r.code}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    color: 'var(--theme-elevation-600)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.memberName || '-'}
                </span>
              </span>
              <span style={{ textAlign: 'right', fontFamily: ACCENT_FONT, color: GOLD, fontSize: 20 }}>
                {r.ticketsSold}
              </span>
              <span style={{ textAlign: 'right', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {eur(r.revenueCents)}
              </span>
            </div>
          ))}

          {hasMore && (
            <button type="button" onClick={() => setExpanded((v) => !v)} style={pillBtn}>
              {expanded ? adminT(lang, 'showLess') : adminT(lang, 'showMore')}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function rowStyle(header: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 90px 110px',
    gap: 12,
    alignItems: 'center',
    padding: '10px 4px',
    borderBottom: '1px solid var(--theme-elevation-100)',
    fontSize: header ? 11 : 15,
    textTransform: header ? 'uppercase' : 'none',
    letterSpacing: header ? 0.4 : 0,
    color: header ? 'var(--theme-elevation-500)' : 'var(--theme-text)',
  }
}
