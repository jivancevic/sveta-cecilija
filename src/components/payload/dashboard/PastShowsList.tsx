import React from 'react'
import Link from 'next/link'
import type { AdminLang } from '@/lib/admin-i18n'
import { adminT } from '@/lib/admin-i18n'
import { showFill, type DashboardShow } from '@/lib/dashboard/capacity'
import { formatShowDate, venueLabel } from './format'

// Past shows collapse to a de-emphasised reference list (#238) — NOT interleaved
// with upcoming, and visually muted. A native <details> keeps the landing
// upcoming-first while past results stay one click away. Each row links to the
// existing per-show stats drill-down.
export function PastShowsList({
  past,
  lang,
}: {
  past: DashboardShow[]
  lang: AdminLang
}) {
  return (
    <details style={{ marginTop: 8, opacity: 0.75 }}>
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: 'var(--theme-elevation-500)',
          padding: '8px 0',
        }}
      >
        {adminT(lang, 'pastShows')} ({past.length})
      </summary>

      {past.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--theme-elevation-500)', margin: '8px 0' }}>
          {adminT(lang, 'noPastShows')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {past.map((s) => {
            const fill = showFill(s)
            return (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderTop: '1px solid var(--theme-elevation-100)',
                  fontSize: 13,
                }}
              >
                <Link
                  href={`/admin/stats/${s.id}`}
                  style={{ color: 'var(--theme-text)', textDecoration: 'none' }}
                >
                  {formatShowDate(s.date, lang)} · {venueLabel(s.venue, lang)}
                </Link>
                <span style={{ color: 'var(--theme-elevation-500)', whiteSpace: 'nowrap' }}>
                  {adminT(lang, 'sold')}: {fill.sold} / {fill.capacity} ({fill.percent}%)
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}
