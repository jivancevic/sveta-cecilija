'use client'

import React from 'react'
import { adminT, type AdminLang } from '@/lib/admin-i18n'

// Month picker + download link for the partner's own monthly reconciliation
// (#146). The export route derives the partner id from the session, so no
// partner id is sent from the client — a partner can only ever download its own
// statement. Defaults to the current month (Europe/Zagreb). Month names are
// localized via Intl so we don't carry a 12-name translation table.

function monthNames(lang: AdminLang): string[] {
  const locale = lang === 'hr' ? 'hr-HR' : 'en-GB'
  return Array.from({ length: 12 }, (_, i) => {
    const name = new Date(Date.UTC(2000, i, 1)).toLocaleDateString(locale, {
      month: 'long',
      timeZone: 'UTC',
    })
    return name.charAt(0).toUpperCase() + name.slice(1)
  })
}

function zagrebNow(): { year: number; month: number } {
  const local = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })
  const [year, month] = local.split('-').map(Number)
  return { year, month }
}

export function StatementDownload({ lang }: { lang: AdminLang }) {
  const now = zagrebNow()
  const MONTHS = monthNames(lang)
  const [year, setYear] = React.useState(now.year)
  const [month, setMonth] = React.useState(now.month)

  // A small window of recent years to choose from.
  const years = [now.year, now.year - 1, now.year - 2]
  const href = `/api/partner/reconciliation?year=${year}&month=${month}&format=csv`

  const field: React.CSSProperties = {
    padding: '10px 12px',
    background: 'var(--theme-elevation-0)',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 6,
    color: 'var(--theme-text)',
    fontSize: 14,
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <label htmlFor="stmt-month" style={smallLabel}>{adminT(lang, 'stmtMonth')}</label>
        <select id="stmt-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={field}>
          {MONTHS.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="stmt-year" style={smallLabel}>{adminT(lang, 'stmtYear')}</label>
        <select id="stmt-year" value={year} onChange={(e) => setYear(Number(e.target.value))} style={field}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <a
        href={href}
        style={{
          padding: '10px 16px',
          background: 'var(--theme-success-500, #1f7a3a)',
          border: 'none',
          borderRadius: 6,
          color: '#fff',
          fontWeight: 700,
          fontSize: 14,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        {adminT(lang, 'stmtDownload')}
      </a>
    </div>
  )
}

const smallLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--theme-elevation-600)',
  marginBottom: 4,
}
