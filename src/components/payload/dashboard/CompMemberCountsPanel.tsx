'use client'

import React, { useState } from 'react'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT } from '@/lib/admin-i18n'
import type { CompMemberCountRow } from '@/lib/tickets/sold-seats'
import { ACCENT_FONT, GOLD, SECTION_LABEL_STYLE } from './format'

// COMPS-PER-MEMBER REPORT (#323, ADR-0019). A flat observational table of the
// goodwill (comp) tickets issued per member this season: the total plus its
// adult/child split, biggest recipient first, with the "show 3 → show more"
// expand pattern the other dashboard panels use. Cancelled/voided comps are
// already excluded upstream by the active-ticket count, so the figures self-heal
// on a void. Admin-tier only — rendered from AdminDashboardView, which gates on
// the role. No per-member drill-down in this slice.

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

export function CompMemberCountsPanel({
  rows,
  lang,
}: {
  rows: CompMemberCountRow[]
  lang: AdminLang
}) {
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? rows : rows.slice(0, TOP_N)
  const hasMore = rows.length > TOP_N

  return (
    <section style={{ marginTop: 28 }}>
      <div style={SECTION_LABEL_STYLE}>{adminT(lang, 'compsByMember')}</div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--theme-elevation-500)' }}>
          {adminT(lang, 'noComps')}
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--theme-elevation-500)', margin: '0 0 12px' }}>
            {adminT(lang, 'compsByMemberDesc')}
          </p>

          {/* Header row */}
          <div style={rowStyle(true)}>
            <span>{adminT(lang, 'compsMember')}</span>
            <span style={{ textAlign: 'right' }}>{adminT(lang, 'compsAdult')}</span>
            <span style={{ textAlign: 'right' }}>{adminT(lang, 'compsChild')}</span>
            <span style={{ textAlign: 'right' }}>{adminT(lang, 'compsTotal')}</span>
          </div>

          {visible.map((r) => (
            <div key={r.memberId} style={rowStyle(false)}>
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.memberName || '-'}
              </span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {r.adultTickets}
              </span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {r.childTickets}
              </span>
              <span style={{ textAlign: 'right', fontFamily: ACCENT_FONT, color: GOLD, fontSize: 20 }}>
                {r.totalTickets}
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
    gridTemplateColumns: 'minmax(0, 1fr) 70px 70px 70px',
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
